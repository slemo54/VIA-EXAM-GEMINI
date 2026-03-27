import React, { useState } from 'react';
import { Check, X } from 'lucide-react';

interface ManualOverrideActionProps {
  questionNumber: number;
  currentDetected: string | string[] | null;
  options: string[];
  onOverride: (question: number, newAnswer: string | null) => void;
  onCancel: () => void;
}

export function ManualOverrideAction({ questionNumber, currentDetected, options, onOverride, onCancel }: ManualOverrideActionProps) {
  const [selected, setSelected] = useState<string | null>(
    typeof currentDetected === 'string' ? currentDetected : null
  );

  return (
    <div className="absolute bottom-6 right-6 bg-white shadow-2xl rounded-xl border border-gray-200 p-6 z-50 animate-in fade-in slide-in-from-bottom-4 duration-200">
      <div className="flex justify-between items-start mb-4">
        <div>
          <h3 className="text-lg font-bold text-gray-900">Manual Override</h3>
          <p className="text-sm text-gray-500">Question {questionNumber}</p>
        </div>
        <button onClick={onCancel} className="text-gray-400 hover:text-gray-600">
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="flex space-x-3 mb-6">
        {options.map((opt) => (
          <button
            key={opt}
            onClick={() => setSelected(opt)}
            className={`w-12 h-12 rounded-full font-bold text-lg flex items-center justify-center transition-all ${
              selected === opt
                ? 'bg-blue-600 text-white shadow-md transform scale-105 ring-2 ring-blue-300 ring-offset-2'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200 border border-gray-300'
            }`}
          >
            {opt}
          </button>
        ))}
        <button
          onClick={() => setSelected(null)}
          className={`w-12 h-12 rounded-full font-medium text-sm flex items-center justify-center transition-all ${
            selected === null
              ? 'bg-gray-800 text-white shadow-md transform scale-105 ring-2 ring-gray-400 ring-offset-2'
              : 'bg-white text-gray-500 hover:bg-gray-50 border border-dashed border-gray-300'
          }`}
          title="Mark as Blank"
        >
          Blank
        </button>
      </div>

      <div className="flex space-x-3">
        <button
          onClick={onCancel}
          className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50 transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={() => onOverride(questionNumber, selected)}
          className="flex-1 px-4 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors shadow-sm flex items-center justify-center"
        >
          <Check className="w-4 h-4 mr-2" />
          Confirm
        </button>
      </div>
    </div>
  );
}
