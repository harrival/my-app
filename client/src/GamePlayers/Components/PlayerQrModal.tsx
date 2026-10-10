import React, { useEffect, useRef, useCallback } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { FaPrint, FaTimes } from 'react-icons/fa';
import { type Player } from './PlayerInterface';
import classes from '../Styles/PlayerQrModal.module.scss';

interface PlayerQrModalProps {
  player: Player;
  onClose: () => void;
  autoPrint?: boolean;
}

const PlayerQrModal: React.FC<PlayerQrModalProps> = ({
  player,
  onClose,
  autoPrint = true,
}) => {
  const printedRef = useRef<boolean>(false);

  const handlePrint = useCallback(() => {
    window.print();
  }, []);

  useEffect(() => {
    if (autoPrint && !printedRef.current) {
      printedRef.current = true;
      const timer = setTimeout(() => {
        handlePrint();
      }, 400);
      return () => clearTimeout(timer);
    }
  }, [autoPrint, handlePrint]);

  return (
    <div className={classes.backdrop} onClick={onClose}>
      <div className={classes.modal} onClick={(e) => e.stopPropagation()}>
        <div className={classes.modalHeader}>
          <h2>
            <FaPrint /> Player QR Ticket
          </h2>
          <button className={classes.closeBtn} onClick={onClose} aria-label="Close">
            <FaTimes />
          </button>
        </div>

        <div className={classes.modalBody}>
          <div className={`${classes.ticketCard} printable-player-badge`}>
            <div className={`${classes.ticketTitle} badge-title`}>Triple Great Game</div>
            <div className={`${classes.qrContainer} badge-qr`}>
              <QRCodeSVG
                value={player.username}
                size={180}
                level="H"
                includeMargin={true}
              />
            </div>
            <div className={`${classes.username} badge-username`}>{player.username}</div>
            <div className={`${classes.badge} badge-type`}>{player.puzzle_type} PUZZLE</div>
          </div>

          <div className={classes.actions}>
            <button
              type="button"
              className={classes.printBtn}
              onClick={handlePrint}
            >
              <FaPrint /> Send to Printer
            </button>
            <button
              type="button"
              className={classes.doneBtn}
              onClick={onClose}
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PlayerQrModal;
