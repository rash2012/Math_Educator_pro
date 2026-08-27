import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Trash2, AlertTriangle, X } from 'lucide-react';

interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  type?: 'danger' | 'warning';
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = 'حذف',
  cancelText = 'إلغاء',
  type = 'danger'
}) => {
  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <motion.div
            initial={{ scale: 0.95, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: 20 }}
            className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden"
            dir="rtl"
          >
            <div className="p-6">
              <div className="flex items-center gap-4 mb-4">
                <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
                  type === 'danger' ? 'bg-red-100 text-red-600' : 'bg-amber-100 text-amber-600'
                }`}>
                  {type === 'danger' ? <Trash2 size={24} /> : <AlertTriangle size={24} />}
                </div>
                <h3 className="text-xl font-black text-gray-900">{title}</h3>
              </div>
              
              <p className="text-gray-600 font-bold leading-relaxed">
                {message}
              </p>
            </div>
            
            <div className="bg-gray-50 px-6 py-4 flex flex-row-reverse gap-3">
              <button
                onClick={() => {
                  onConfirm();
                  onClose();
                }}
                className={`flex-1 py-3 rounded-xl font-black transition-all ${
                  type === 'danger' 
                  ? 'bg-red-600 text-white hover:bg-red-700 shadow-lg shadow-red-600/20' 
                  : 'bg-amber-600 text-white hover:bg-amber-700 shadow-lg shadow-amber-600/20'
                }`}
              >
                {confirmText}
              </button>
              <button
                onClick={onClose}
                className="flex-1 py-3 bg-white border border-gray-200 text-gray-700 rounded-xl font-black hover:bg-gray-100 transition-all"
              >
                {cancelText}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
