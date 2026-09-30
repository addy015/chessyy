import React, { useState, useEffect, useRef } from 'react';
import { useUser } from '../../context/UserContext';
import { useToast } from '../../context/ToastContext';

export default function IdentityModal() {
  const { handle, updateHandle, isEditModalOpen, closeEditModal } = useUser();
  const { showToast } = useToast();
  const [inputValue, setInputValue] = useState(handle);
  const [errorMsg, setErrorMsg] = useState('');
  const inputRef = useRef(null);

  useEffect(() => {
    if (isEditModalOpen) {
      setInputValue(handle);
      setErrorMsg('');
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isEditModalOpen, handle]);

  if (!isEditModalOpen) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    const res = updateHandle(inputValue);
    if (!res.success) {
      setErrorMsg(res.error);
    } else {
      setErrorMsg('');
      closeEditModal();
      showToast(`Handle saved: ${inputValue.trim().toUpperCase()}`);
    }
  };

  return (
    <div
      id="name-modal"
      className="editorial-modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) closeEditModal();
      }}
    >
      <div className="editorial-modal-box modal-responsive-box">
        <div className="modal-header-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '14px' }}>
          <div className="modal-protocol-tag" style={{ marginBottom: 0 }}>IDENTITY CONFIGURATION</div>
          <button type="button" className="btn-modal-close" onClick={closeEditModal} aria-label="Close modal">
            &times;
          </button>
        </div>

        <h2 className="modal-headline modal-headline-sm" style={{ marginBottom: '8px' }}>SET PLAYER HANDLE</h2>
        <p className="modal-body-text" style={{ marginBottom: '18px', fontSize: '0.85rem' }}>
          Choose your match handle (2–10 characters). Displayed in live matches, chat, and post-game analysis.
        </p>

        <form onSubmit={handleSubmit}>
          <div className="friend-input-wrapper">
            <input
              ref={inputRef}
              type="text"
              className="friend-code-input"
              placeholder="HANDLE (MAX 10)"
              maxLength={10}
              autoComplete="off"
              spellCheck="false"
              value={inputValue}
              onChange={(e) => {
                setInputValue(e.target.value);
                if (errorMsg) setErrorMsg('');
              }}
            />
          </div>
          {errorMsg && (
            <div className="friend-error-text" style={{ marginTop: '8px' }}>
              {errorMsg}
            </div>
          )}

          <div className="modal-actions" style={{ marginTop: '18px', display: 'flex', gap: '10px' }}>
            <button type="button" className="btn-editorial" style={{ flex: 1, justifyContent: 'center' }} onClick={closeEditModal}>
              CANCEL ✕
            </button>
            <button type="submit" className="btn-editorial btn-editorial-solid" style={{ flex: 1.4, justifyContent: 'center' }}>
              SAVE &rarr;
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
