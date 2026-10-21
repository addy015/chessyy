import { createContext, useContext, useState } from 'react';

const UserContext = createContext();

// LocalStorage keys for saving the handle
const STORAGE_KEY = 'chessyy_handle';
const LEGACY_STORAGE_KEY = 'chessyy_player_name';

// Load saved handle from localStorage or assign a random GUEST-xxxx ID
function getInitialHandle() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY) || localStorage.getItem(LEGACY_STORAGE_KEY);
    if (saved && saved.trim()) {
      return saved.trim().toUpperCase().substring(0, 10);
    }
    // Generate guest handle
    const randomGuest = `GUEST-${Math.floor(1000 + Math.random() * 9000)}`;
    localStorage.setItem(STORAGE_KEY, randomGuest);
    return randomGuest;
  } catch (e) {
    return 'ANONYMOUS';
  }
}

export function UserProvider({ children }) {
  const [handle, setHandleState] = useState(getInitialHandle);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);

  // Validate, format, and save updated handle
  const updateHandle = (newHandle) => {
    if (!newHandle) return { success: false, error: 'Name cannot be empty.' };
    const sanitized = newHandle.trim().toUpperCase();

    if (sanitized.length < 2 || sanitized.length > 10) {
      return { success: false, error: 'Handle must be between 2 and 10 characters.' };
    }

    if (!/^[A-Z0-9_-]+$/.test(sanitized)) {
      return { success: false, error: 'Letters, numbers, underscores, and hyphens only.' };
    }

    // Persist to localStorage
    try {
      localStorage.setItem(STORAGE_KEY, sanitized);
      localStorage.setItem(LEGACY_STORAGE_KEY, sanitized);
    } catch (e) {}

    setHandleState(sanitized);
    return { success: true };
  };

  return (
    <UserContext.Provider
      value={{
        handle,
        updateHandle,
        isEditModalOpen,
        openEditModal: () => setIsEditModalOpen(true),
        closeEditModal: () => setIsEditModalOpen(false),
      }}
    >
      {children}
    </UserContext.Provider>
  );
}

// Hook to access user context anywhere in the app
export function useUser() {
  const context = useContext(UserContext);
  if (!context) {
    throw new Error('useUser must be used within a UserProvider');
  }
  return context;
}
