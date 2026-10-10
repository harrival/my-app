import { useEffect } from 'react';

/**
 * useTVNavigation
 * Enables TV Remote (D-Pad: Up, Down, Left, Right, Select, Back)
 * navigation across the entire React application for Android TV, Fire TV,
 * Apple TV (Web/AirPlay), and Smart TV browsers.
 */
export const useTVNavigation = () => {
  useEffect(() => {
    // Detect if running on a TV / Large screen or if TV gamepad/remote is active
    const isTVDevice = () => {
      const ua = navigator.userAgent.toLowerCase();
      return (
        ua.includes('tv') ||
        ua.includes('smarttv') ||
        ua.includes('googletv') ||
        ua.includes('android tv') ||
        ua.includes('aft') || // Fire TV
        ua.includes('apple tv') ||
        ua.includes('tizen') ||
        ua.includes('webos') ||
        window.innerWidth >= 1920
      );
    };

    if (isTVDevice()) {
      document.body.classList.add('tv-device');
    }

    const FOCUSABLE_SELECTOR =
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

    const getFocusables = () => {
      return Array.from(document.querySelectorAll(FOCUSABLE_SELECTOR)).filter(
        (el) => el.offsetParent !== null && !el.hasAttribute('disabled')
      );
    };

    const handleKeyDown = (e) => {
      const keys = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter', 'Escape', 'Backspace'];
      if (!keys.includes(e.key)) return;

      const focusables = getFocusables();
      if (focusables.length === 0) return;

      const currentFocused = document.activeElement;
      const currentIndex = focusables.indexOf(currentFocused);

      // Handle Back Button on TV remote
      if (e.key === 'Escape' || (e.key === 'Backspace' && currentFocused.tagName !== 'INPUT' && currentFocused.tagName !== 'TEXTAREA')) {
        if (window.history.length > 1) {
          e.preventDefault();
          window.history.back();
        }
        return;
      }

      // If nothing currently focused, focus first interactive element
      if (currentIndex === -1) {
        if (['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
          e.preventDefault();
          focusables[0].focus();
        }
        return;
      }

      const currentRect = currentFocused.getBoundingClientRect();
      let nextElement = null;
      let minDistance = Infinity;

      // Spatial navigation: find the closest element in the arrow direction
      focusables.forEach((candidate) => {
        if (candidate === currentFocused) return;
        const targetRect = candidate.getBoundingClientRect();

        const dx = (targetRect.left + targetRect.right) / 2 - (currentRect.left + currentRect.right) / 2;
        const dy = (targetRect.top + targetRect.bottom) / 2 - (currentRect.top + currentRect.bottom) / 2;

        let isValidDirection = false;
        if (e.key === 'ArrowDown' && dy > 10) isValidDirection = true;
        if (e.key === 'ArrowUp' && dy < -10) isValidDirection = true;
        if (e.key === 'ArrowRight' && dx > 10) isValidDirection = true;
        if (e.key === 'ArrowLeft' && dx < -10) isValidDirection = true;

        if (isValidDirection) {
          // Weight the distance perpendicular to movement higher to prefer straight alignment
          let weightedDistance;
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            weightedDistance = Math.abs(dy) + Math.abs(dx) * 2;
          } else {
            weightedDistance = Math.abs(dx) + Math.abs(dy) * 2;
          }

          if (weightedDistance < minDistance) {
            minDistance = weightedDistance;
            nextElement = candidate;
          }
        }
      });

      if (nextElement) {
        e.preventDefault();
        nextElement.focus();
        nextElement.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      } else {
        // Fallback to sequential linear tab order if no direct spatial neighbor found
        if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
          const nextIdx = (currentIndex + 1) % focusables.length;
          focusables[nextIdx].focus();
          e.preventDefault();
        } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
          const prevIdx = (currentIndex - 1 + focusables.length) % focusables.length;
          focusables[prevIdx].focus();
          e.preventDefault();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);
};
