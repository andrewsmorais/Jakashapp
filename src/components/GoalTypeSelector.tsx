"use client";

import { GOAL_TYPES, type GoalType } from "@/lib/planner";

interface GoalTypeSelectorProps {
  selected: GoalType;
  onChange: (type: GoalType) => void;
}

export function GoalTypeSelector({ selected, onChange }: GoalTypeSelectorProps) {
  const types = Object.entries(GOAL_TYPES) as [GoalType, typeof GOAL_TYPES[GoalType]][];
  const custom = types.find(([k]) => k === "custom");
  const presets = types.filter(([k]) => k !== "custom");

  return (
    <div className="space-y-3">
      {/* Custom goal - prominent at top */}
      {custom && (
        <div>
          <button
            type="button"
            onClick={() => onChange("custom")}
            className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl border-2 font-bold transition-all ${
              selected === "custom"
                ? "border-brand-dark/70 bg-gradient-to-r from-brand-dark/10 to-brand-dark/5 dark:from-brand-soft/10 dark:to-brand-soft/5 text-brand-dark dark:text-brand-soft ring-2 ring-brand-dark/30 dark:ring-brand-soft/30"
                : "border-gray-200 dark:border-[#262626] bg-gray-50/50 dark:bg-[#0B0B0B] text-gray-700 dark:text-gray-300 hover:border-gray-300 dark:hover:border-[#333]"
            }`}
          >
            <span className="text-4xl">{custom[1].icon}</span>
            <div className="text-left">
              <p className="text-base">{custom[1].label}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 font-normal">Dê o nome que quiser ao seu objetivo</p>
            </div>
          </button>
        </div>
      )}

      {/* Preset goals */}
      {presets.length > 0 && (
        <div>
          <p className="text-xs font-bold text-gray-500 dark:text-gray-400 mb-2 px-1 tracking-widest">OBJETIVOS COMUNS</p>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {presets.map(([key, meta]) => (
              <button
                key={key}
                type="button"
                onClick={() => onChange(key)}
                className={`flex flex-col items-center gap-2 px-3 py-3 rounded-2xl border transition-all ${
                  selected === key
                    ? "border-brand-dark/70 bg-brand-dark/10 dark:bg-brand-soft/10 ring-2 ring-brand-dark/30 dark:ring-brand-soft/30"
                    : "border-gray-200 dark:border-[#262626] hover:bg-gray-50 dark:hover:bg-[#0B0B0B]"
                }`}
              >
                <span className="text-3xl">{meta.icon}</span>
                <span className={`text-xs font-bold text-center leading-tight ${selected === key ? "text-brand-dark dark:text-brand-soft" : "text-gray-700 dark:text-gray-300"}`}>
                  {meta.label}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
