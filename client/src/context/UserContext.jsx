import React, { createContext, useContext, useState, useEffect } from 'react';

const UserContext = createContext();

const STORAGE_KEY = 'chessyy_handle';
const LEGACY_STORAGE_KEY = 'chessyy_player_name';

function getInitialHandle() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY) || localStorage.getItem(LEGACY_STORAGE_KEY);
    if (saved && saved.trim()) {
      return saved.trim().toUpperCase().substring(0, 10);
    }
    // Generate deterministic memorable guest handle
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

  // Synchronize storage if handle changes
  const updateHandle = (newHandle) => {
    if (!newHandle) return { success: false, error: 'Name cannot be empty.' };
    const sanitized = newHandle.trim().toUpperCase();

    if (sanitized.length < 2 || sanitized.length > 10) {
      return { success: false, error: 'Handle must be between 2 and 10 characters.' };
    }

    if (!/^[A-Z0-9_-]+$/.test(sanitized)) {
      return { success: false, error: 'Letters, numbers, underscores, and hyphens only.' };
    }

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

export function useUser() {
  const context = useContext(UserContext);
  if (!context) {
    throw new Error('useUser must be used within a UserProvider');
  }
  return context;
}
