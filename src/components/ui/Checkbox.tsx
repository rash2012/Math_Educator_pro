import React from 'react';

interface CheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  color?: 'indigo' | 'amber' | 'emerald';
  label?: string;
}

export const Checkbox: React.FC<CheckboxProps> = ({ checked, onChange, color = 'indigo', label }) => {
  const colorClasses = {
    indigo: 'text-indigo-600 focus:ring-indigo-500',
    amber: 'text-amber-600 focus:ring-amber-500',
    emerald: 'text-emerald-600 focus:ring-emerald-500'
  };

  return (
    <label className="flex items-center gap-2 cursor-pointer">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className={`w-4 h-4 rounded border-gray-300 ${colorClasses[color]} transition-colors`}
      />
      {label && <span className="text-sm text-gray-700">{label}</span>}
    </label>
  );
};
