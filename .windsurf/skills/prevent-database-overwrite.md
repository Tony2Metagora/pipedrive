---
description: Prevent database overwrite and data loss during read-modify-write operations
---

# SKILL: Prevent Database Overwrite

## Problem rencontré

Le 11 mars 2026, **69 deals ont été perdus deux fois** à cause de :

1. **Migration destructive** : un rollback d'architecture (per-deal files → single deals.json) a lu une version CDN stale (vide), l'a écrite comme "la vraie donnée", puis a supprimé les fichiers source. Résultat : tout perdu.
2. **Endpoint de test qui écrit** : `/api/debug/test-write` lisait deals.json (0 résultats à cause du CDN), ajoutait un marqueur, et réécrivait → écrasement avec `[]`.

## Cause racine

Vercel Blob `get()` passe par un CDN qui cache 20-60s. Un read-modify-write basé sur une lecture stale peut écraser les vraies données.

## Règles à appliquer SYSTÉMATIQUEMENT

### 1. Protection anti-wipe
Toujours vérifier avant d'écrire :
```typescript
if (updated.length === 0 && existing.length > 3) {
  console.error("BLOCKED: refusing to wipe data");
  return existing;
}
```

### 2. Jamais de suppression dans une migration
- Copier vers la nouvelle destination
- Vérifier que la copie est complète (count match)
- Marquer l'ancien comme deprecated, NE PAS supprimer
- Supprimer seulement après validation manuelle

### 3. Jamais d'écriture dans un endpoint de debug
- Les endpoints de diagnostic doivent être **READ-ONLY**
- Si on doit tester l'écriture, utiliser un fichier test séparé (`test-deals.json`), jamais la vraie donnée

### 4. Backup AVANT toute opération destructive
- Créer un backup timestampé avant migration, bulk update, changement d'architecture
- Le backup doit être dans un fichier/clé séparé qui ne sera pas touché par l'opération

### 5. Valider après écriture
- Après un write critique, relire et vérifier que le count et les données correspondent
- Si la validation échoue, restaurer depuis le backup

### 6. Latence de lecture = optimistic UI
- Si le storage a du cache/latence, ne PAS essayer de contourner le cache côté serveur
- Gérer la latence côté frontend avec de l'état local optimiste
- Le serveur finira par être cohérent (eventual consistency)

## Applicabilité
Ce skill s'applique à **tout projet** utilisant un data store avec :
- CDN/cache sur les lectures (Vercel Blob, S3, CloudFlare R2...)
- Pattern read-modify-write (JSON files, KV stores...)
- Migrations de schéma ou d'architecture de stockage
