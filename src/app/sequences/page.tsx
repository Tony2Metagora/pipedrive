"use client";

import { Mail, Rocket } from "lucide-react";

export default function SequencesPage() {
  return (
    <>
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 bg-violet-100 rounded-xl flex items-center justify-center">
          <Mail className="w-5 h-5 text-violet-600" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-gray-900">Séquence Mail</h1>
          <p className="text-sm text-gray-500">Campagnes email automatisées via Smartlead</p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
        <div className="w-16 h-16 bg-violet-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <Rocket className="w-8 h-8 text-violet-400" />
        </div>
        <h2 className="text-lg font-semibold text-gray-800 mb-2">Bientôt disponible</h2>
        <p className="text-sm text-gray-500 max-w-md mx-auto">
          L&apos;intégration Smartlead arrive bientôt. Vous pourrez créer des campagnes,
          importer des listes, gérer les séquences et suivre les statistiques.
        </p>
      </div>
    </>
  );
}
