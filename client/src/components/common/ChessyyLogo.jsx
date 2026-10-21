// Brand logo icon with custom display size
export default function ChessyyLogo({ size = 32, className = '' }) {
  return (
    <img
      src="/logo.svg"
      alt="Chessyy Logo"
      width={size}
      height={size}
      className={`chessyy-brand-logo ${className}`}
      style={{
        display: 'block',
        width: `${size}px`,
        height: `${size}px`,
        objectFit: 'contain'
      }}
    />
  );
}
