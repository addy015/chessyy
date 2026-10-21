import { createContext, useContext, useState, useCallback, useRef } from 'react';

const ToastContext = createContext();

export function ToastProvider({ children }) {
  const [toast, setToast] = useState({ visible: false, message: '' });
  const timerRef = useRef(null);

  // Show toast notification and auto-hide after duration
  const showToast = useCallback((message, duration = 3200) => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    setToast({ visible: true, message });
    timerRef.current = setTimeout(() => {
      setToast({ visible: false, message: '' });
    }, duration);
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div id="notification" className={`editorial-toast ${toast.visible ? '' : 'hidden'}`}>
        <span id="notification-text">{toast.message}</span>
      </div>
    </ToastContext.Provider>
  );
}

// Hook to trigger toasts from anywhere in the app
export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}

