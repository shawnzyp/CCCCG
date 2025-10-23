const createEventTarget = () => {
  if (typeof globalThis !== 'undefined' && typeof globalThis.EventTarget === 'function') {
    return new globalThis.EventTarget();
  }
  const listeners = new Map();
  return {
    addEventListener(type, callback) {
      if (typeof callback !== 'function') return;
      if (!listeners.has(type)) {
        listeners.set(type, new Set());
      }
      listeners.get(type).add(callback);
    },
    removeEventListener(type, callback) {
      const set = listeners.get(type);
      if (!set) return;
      set.delete(callback);
      if (set.size === 0) {
        listeners.delete(type);
      }
    },
    dispatchEvent(event) {
      if (!event || typeof event.type !== 'string') return true;
      const set = listeners.get(event.type);
      if (!set) return true;
      set.forEach((listener) => {
        listener.call(undefined, event);
      });
      return true;
    }
  };
};

const createCustomEvent = (type, detail) => {
  if (typeof globalThis !== 'undefined' && typeof globalThis.CustomEvent === 'function') {
    return new globalThis.CustomEvent(type, { detail });
  }
  return { type, detail };
};

const stateEvents = createEventTarget();

let controllerInstance = null;

function createPlayerToolsDrawer() {
  const drawer = document.getElementById('player-tools-drawer');
  const tab = document.getElementById('player-tools-tab');
  if (!drawer || !tab) {
    return {
      open() {},
      close() {},
      toggle() {},
      subscribe(listener) {
        if (typeof listener === 'function') {
          listener({ open: false });
        }
        return () => {};
      }
    };
  }

  const dispatchStateChange = (isOpen) => {
    stateEvents.dispatchEvent(createCustomEvent('change', { open: isOpen }));
  };

  const scrim = drawer.querySelector('.player-tools-drawer__scrim');
  const content = drawer.querySelector('[data-player-tools-content]');

  const motionPreference = null;

  const body = document.body;
  const requestFrame =
    typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function'
      ? window.requestAnimationFrame.bind(window)
      : (callback) =>
          window.setTimeout(
            () =>
              callback(
                typeof performance !== 'undefined' && typeof performance.now === 'function'
                  ? performance.now()
                  : Date.now()
              ),
            16
          );

  const cancelFrame =
    typeof window !== 'undefined' && typeof window.cancelAnimationFrame === 'function'
      ? window.cancelAnimationFrame.bind(window)
      : (handle) => window.clearTimeout(handle);


  const clamp = (value, min, max) => {
    if (!Number.isFinite(value)) return value;
    if (Number.isFinite(min) && value < min) return min;
    if (Number.isFinite(max) && value > max) return max;
    return value;
  };

  const parseDuration = (value) => {
    if (typeof value !== 'string') {
      return Number.isFinite(value) ? Number(value) : 0;
    }
    const trimmed = value.trim();
    if (!trimmed) return 0;
    if (trimmed.endsWith('ms')) {
      const parsed = parseFloat(trimmed.slice(0, -2));
      return Number.isFinite(parsed) ? parsed : 0;
    }
    if (trimmed.endsWith('s')) {
      const parsed = parseFloat(trimmed.slice(0, -1));
      return Number.isFinite(parsed) ? parsed * 1000 : 0;
    }
    const fallback = parseFloat(trimmed);
    return Number.isFinite(fallback) ? fallback : 0;
  };

  const getTransitionDuration = () => {
    const rootStyles = window.getComputedStyle(document.documentElement);
    const raw = rootStyles.getPropertyValue('--player-tools-transition-duration');
    const duration = parseDuration(raw);
    return Number.isFinite(duration) && duration >= 0 ? duration : 0;
  };

  const easeOutCubic = (value) => {
    const clamped = clamp(value, 0, 1);
    const inverted = 1 - clamped;
    return 1 - inverted * inverted * inverted;
  };

  let openProgress = 0;

  const applyOpenProgress = (value) => {
    const next = clamp(value, 0, 1);
    openProgress = next;
    drawer.style.setProperty('--player-tools-open-progress', `${next}`);
    tab.style.setProperty('--player-tools-open-progress', `${next}`);
    if (content) {
      content.style.setProperty('--player-tools-open-progress', `${next}`);
    }
  };

  let openAnimationFrame = null;
  let openAnimationStart = null;
  let openAnimationTarget = 0;
  let openAnimationCompletion = null;

  const stopOpenAnimation = (cancelled) => {
    if (openAnimationFrame !== null) {
      cancelFrame(openAnimationFrame);
      openAnimationFrame = null;
    }
    openAnimationStart = null;
    if (!cancelled && typeof openAnimationCompletion === 'function') {
      openAnimationCompletion();
    }
    openAnimationCompletion = null;
  };

  const isMotionReduced = () => false;

  const animateOpenProgress = (target, onComplete) => {
    const destination = clamp(target, 0, 1);
    stopOpenAnimation(true);

    if (isMotionReduced()) {
      applyOpenProgress(destination);
      if (typeof onComplete === 'function') {
        onComplete();
      }
      return;
    }

    const duration = getTransitionDuration();
    const startValue = openProgress;
    if (!Number.isFinite(duration) || duration <= 16 || Math.abs(startValue - destination) <= 0.001) {
      applyOpenProgress(destination);
      if (typeof onComplete === 'function') {
        onComplete();
      }
      return;
    }

    openAnimationTarget = destination;
    openAnimationCompletion = typeof onComplete === 'function' ? onComplete : null;
    openAnimationStart = null;

    const step = (timestamp) => {
      if (openAnimationStart === null) {
        openAnimationStart = timestamp;
      }
      const elapsed = timestamp - openAnimationStart;
      const progress = clamp(duration === 0 ? 1 : elapsed / duration, 0, 1);
      const eased = easeOutCubic(progress);
      const value = startValue + (openAnimationTarget - startValue) * eased;
      applyOpenProgress(value);
      if (progress < 1) {
        openAnimationFrame = requestFrame(step);
        return;
      }
      openAnimationFrame = null;
      openAnimationStart = null;
      applyOpenProgress(openAnimationTarget);
      if (typeof openAnimationCompletion === 'function') {
        openAnimationCompletion();
      }
      openAnimationCompletion = null;
    };

    openAnimationFrame = requestFrame(step);
  };

  const applyTabTopProperty = () => {
    if (!tab) return;
    const viewport = window.visualViewport;

    if (viewport) {
      const viewportHeight = Number.isFinite(viewport.height) ? viewport.height : 0;
      const viewportTop = Number.isFinite(viewport.offsetTop)
        ? viewport.offsetTop
        : Number.isFinite(viewport.pageTop)
          ? viewport.pageTop
          : 0;
      const desiredCenter = viewportTop + viewportHeight / 2;
      if (Number.isFinite(desiredCenter) && viewportHeight > 0) {
        tab.style.setProperty('--player-tools-tab-top', `${desiredCenter}px`);
      } else {
        tab.style.removeProperty('--player-tools-tab-top');
      }
      return;
    }

    const viewHeight = window.innerHeight || document.documentElement?.clientHeight;
    const scrollTop = window.pageYOffset || document.documentElement?.scrollTop || 0;
    if (!Number.isFinite(viewHeight) || viewHeight <= 0) {
      tab.style.removeProperty('--player-tools-tab-top');
      return;
    }
    const desiredCenter = scrollTop + viewHeight / 2;
    if (Number.isFinite(desiredCenter)) {
      tab.style.setProperty('--player-tools-tab-top', `${desiredCenter}px`);
    } else {
      tab.style.removeProperty('--player-tools-tab-top');
    }
  };

  const getDrawerSlideDirection = () => {
    const rootStyles = window.getComputedStyle(document.documentElement);
    const direction = parseFloat(rootStyles.getPropertyValue('--drawer-slide-direction'));
    return Number.isFinite(direction) && direction !== 0 ? direction : -1;
  };

  const updateTabOffset = (width) => {
    if (!tab || !drawer) return;
    const rect = typeof drawer.getBoundingClientRect === 'function' ? drawer.getBoundingClientRect() : null;
    let drawerWidth = Number.isFinite(width) ? width : rect?.width;
    if (!Number.isFinite(drawerWidth) || drawerWidth <= 0) {
      const fallbackWidth = drawer.offsetWidth || drawer.clientWidth;
      if (Number.isFinite(fallbackWidth) && fallbackWidth > 0) {
        drawerWidth = fallbackWidth;
      }
    }
    const tabStyle = tab?.style;
    const clearTabOffset = () => {
      if (!tabStyle) return;
      if (typeof tabStyle.removeProperty === 'function') {
        tabStyle.removeProperty('--player-tools-tab-offset');
        return;
      }
      if (typeof tabStyle.setProperty === 'function') {
        tabStyle.setProperty('--player-tools-tab-offset', '0px');
      }
    };

    if (!Number.isFinite(drawerWidth) || drawerWidth <= 0) {
      clearTabOffset();
      return;
    }
    const direction = getDrawerSlideDirection();
    const baseOffset = drawerWidth * direction * -1;
    if (!Number.isFinite(baseOffset)) {
      clearTabOffset();
      return;
    }

    let offset = baseOffset;

    const computeViewportWidth = () => {
      const measurements = [];
      const viewport = window.visualViewport;
      const viewportWidth = viewport?.width;
      if (Number.isFinite(viewportWidth) && viewportWidth > 0) {
        measurements.push(viewportWidth);
      }

      const innerWidth = window.innerWidth;
      if (Number.isFinite(innerWidth) && innerWidth > 0) {
        measurements.push(innerWidth);
      }

      const docElement = document.documentElement;
      const docClientWidth = docElement?.clientWidth;
      if (Number.isFinite(docClientWidth) && docClientWidth > 0) {
        measurements.push(docClientWidth);
      }

      const bodyClientWidth = document.body?.clientWidth;
      if (Number.isFinite(bodyClientWidth) && bodyClientWidth > 0) {
        measurements.push(bodyClientWidth);
      }

      if (!measurements.length) return null;
      return Math.min(...measurements);
    };

    const computeTabWidth = () => {
      if (!tab) return null;
      if (typeof tab.getBoundingClientRect === 'function') {
        const rect = tab.getBoundingClientRect();
        if (rect && Number.isFinite(rect.width) && rect.width > 0) {
          return rect.width;
        }
      }
      const fallbackWidth = tab.offsetWidth || tab.clientWidth;
      if (Number.isFinite(fallbackWidth) && fallbackWidth > 0) {
        return fallbackWidth;
      }
      return null;
    };

    const viewportWidth = computeViewportWidth();
    const tabWidth = computeTabWidth();

    if (Number.isFinite(viewportWidth) && viewportWidth > 0 && Number.isFinite(tabWidth) && tabWidth > 0) {
      const availableDistance = Math.max(0, viewportWidth - tabWidth);
      if (offset > 0) {
        offset = Math.min(offset, availableDistance);
      } else if (offset < 0) {
        offset = Math.max(offset, -availableDistance);
      }
    }

    if (tabStyle && typeof tabStyle.setProperty === 'function') {
      tabStyle.setProperty('--player-tools-tab-offset', `${offset}px`);
    }
  };

  let tabTopUpdateFrame = null;
  const scheduleTabTopUpdate = () => {
    if (tabTopUpdateFrame !== null) return;
    tabTopUpdateFrame = requestFrame(() => {
      tabTopUpdateFrame = null;
      applyTabTopProperty();
      updateTabOffset();
    });
  };

  const initializeTabTrackers = () => {
    applyTabTopProperty();
    updateTabOffset();

    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', scheduleTabTopUpdate);
      window.visualViewport.addEventListener('scroll', scheduleTabTopUpdate);
    } else {
      window.addEventListener('resize', scheduleTabTopUpdate);
      window.addEventListener('orientationchange', scheduleTabTopUpdate);
      window.addEventListener('scroll', scheduleTabTopUpdate, { passive: true });
    }

    if (typeof ResizeObserver === 'function') {
      const drawerObserver = new ResizeObserver((entries) => {
        for (const entry of entries) {
          if (entry?.target === drawer) {
            const measuredWidth = entry?.contentRect?.width;
            updateTabOffset(typeof measuredWidth === 'number' ? measuredWidth : undefined);
            scheduleTabTopUpdate();
          }
        }
      });
      drawerObserver.observe(drawer);
      drawer._playerToolsDrawerResizeObserver = drawerObserver;

      const tabObserver = new ResizeObserver(() => {
        scheduleTabTopUpdate();
      });
      tabObserver.observe(tab);
      tab._playerToolsTabResizeObserver = tabObserver;
    }
  };

  initializeTabTrackers();

  applyOpenProgress(drawer.classList.contains('is-open') ? 1 : 0);

  const batteryBadge = drawer.querySelector('[data-player-tools-battery]');
  const batteryFill = batteryBadge?.querySelector('[data-player-tools-battery-fill]');
  const batteryIcon = batteryBadge?.querySelector('[data-player-tools-battery-icon]');

  const BATTERY_ICON_PATHS = {
    charging: 'images/vertical-charging-battery-svgrepo-com.svg',
    full: 'images/vertical-battery-100-svgrepo-com.svg',
    high: 'images/vertical-battery-75-svgrepo-com.svg',
    medium: 'images/vertical-battery-50-svgrepo-com.svg',
    low: 'images/vertical-battery-25-svgrepo-com.svg',
    empty: 'images/vertical-battery-0-svgrepo-com.svg',
    unavailable: 'images/vertical-battery-0-svgrepo-com.svg'
  };
  const batteryText = batteryBadge?.querySelector('[data-player-tools-battery-text]');
  const batteryLabel = batteryBadge?.querySelector('[data-player-tools-battery-label]');

  const setBatteryLabel = (message) => {
    if (!batteryLabel || typeof message !== 'string') return;
    batteryLabel.textContent = message;
  };

  const setBatteryText = (value) => {
    if (!batteryText || typeof value !== 'string') return;
    batteryText.textContent = value;
  };

  const setBatteryFill = (percent) => {
    if (!batteryFill) return;
    if (!Number.isFinite(percent)) {
      batteryFill.style.setProperty('--player-tools-meter-fill', '0%');
      return;
    }
    const clamped = clamp(Math.round(percent), 0, 100);
    batteryFill.style.setProperty('--player-tools-meter-fill', `${clamped}%`);
  };

  const setBatteryIcon = (state) => {
    if (!batteryIcon) return;
    const iconPath = BATTERY_ICON_PATHS[state] ?? BATTERY_ICON_PATHS.unavailable;
    if (batteryIcon.getAttribute('src') !== iconPath) {
      batteryIcon.setAttribute('src', iconPath);
    }
  };

  const setBatteryState = (state, { text, fill, announcement } = {}) => {
    if (!batteryBadge) return;
    if (state) {
      batteryBadge.dataset.batteryState = state;
    } else {
      batteryBadge.removeAttribute('data-battery-state');
    }
    setBatteryIcon(state ?? 'unavailable');
    if (typeof text === 'string') {
      setBatteryText(text);
    }
    if (Number.isFinite(fill)) {
      setBatteryFill(fill);
    }
    if (fill === null) {
      setBatteryFill(0);
    }
    if (typeof announcement === 'string') {
      setBatteryLabel(announcement);
    }
  };

  const describeBatteryAnnouncement = (percent, charging) => {
    if (!Number.isFinite(percent)) {
      return 'Battery status unavailable';
    }
    const rounded = clamp(Math.round(percent), 0, 100);
    if (charging) {
      return `Battery charging, ${rounded} percent available`;
    }
    if (rounded >= 100) {
      return 'Battery fully charged';
    }
    return `Battery at ${rounded} percent`;
  };

  const getBatteryStateFromLevel = (level) => {
    if (!Number.isFinite(level)) return 'unavailable';
    const clamped = clamp(level, 0, 1);
    const percent = clamped * 100;
    if (percent >= 95) return 'full';
    if (percent >= 75) return 'high';
    if (percent >= 45) return 'medium';
    if (percent >= 15) return 'low';
    return 'empty';
  };

  const updateBatteryFromManager = (batteryManager) => {
    if (!batteryManager) {
      setBatteryState('unavailable', {
        text: 'Unavailable',
        fill: 0,
        announcement: 'Battery status unavailable'
      });
      return;
    }

    const level = Number.isFinite(batteryManager.level) ? batteryManager.level : null;
    const charging = batteryManager.charging === true;
    if (level === null) {
      setBatteryState('unavailable', {
        text: charging ? 'Charging' : 'Unavailable',
        fill: charging ? 50 : 0,
        announcement: 'Battery status unavailable'
      });
      return;
    }

    const clampedLevel = clamp(level, 0, 1);
    const percent = clamp(Math.round(clampedLevel * 100), 0, 100);
    const state = charging ? 'charging' : getBatteryStateFromLevel(clampedLevel);
    const text = charging ? `Charging ${percent}%` : `${percent}%`;
    const announcement = describeBatteryAnnouncement(percent, charging);

    setBatteryState(state, {
      text,
      fill: percent,
      announcement
    });
  };

  if (batteryBadge) {
    setBatteryState('unavailable', {
      text: 'Unavailable',
      fill: 0,
      announcement: 'Battery status unavailable'
    });

    const supportsBatteryApi =
      typeof navigator !== 'undefined' && typeof navigator.getBattery === 'function';

    if (supportsBatteryApi) {
      navigator
        .getBattery()
        .then((batteryManager) => {
          if (!batteryManager) {
            setBatteryState('unavailable', {
              text: 'Unavailable',
              fill: 0,
              announcement: 'Battery status unavailable'
            });
            return;
          }

          const handleBatteryChange = () => {
            updateBatteryFromManager(batteryManager);
          };

          updateBatteryFromManager(batteryManager);

          batteryManager.addEventListener('levelchange', handleBatteryChange);
          batteryManager.addEventListener('chargingchange', handleBatteryChange);

          batteryBadge._playerToolsBatteryCleanup = () => {
            batteryManager.removeEventListener('levelchange', handleBatteryChange);
            batteryManager.removeEventListener('chargingchange', handleBatteryChange);
          };
        })
        .catch(() => {
          setBatteryState('unavailable', {
            text: 'Unavailable',
            fill: 0,
            announcement: 'Battery status unavailable'
          });
        });
    }
  }

  const clockElement = drawer.querySelector('[data-player-tools-clock]');
  let clockTimer = null;

  const clearClockTimer = () => {
    if (clockTimer !== null && typeof window !== 'undefined') {
      window.clearTimeout(clockTimer);
      clockTimer = null;
    }
  };

  const formatClockValue = (date) => {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
    try {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch (error) {
      const hours = date.getHours();
      const minutes = date.getMinutes();
      const pad = (value) => String(value).padStart(2, '0');
      return `${pad(hours)}:${pad(minutes)}`;
    }
  };

  const updateClock = () => {
    if (!clockElement) return;
    const now = new Date();
    const formatted = formatClockValue(now);
    if (formatted) {
      clockElement.textContent = formatted;
    }
    if (clockElement.setAttribute && Number.isFinite(now.getTime())) {
      clockElement.setAttribute('datetime', now.toISOString());
    }
  };

  const scheduleClockTick = () => {
    if (!clockElement || typeof window === 'undefined') return;
    clearClockTimer();
    const now = new Date();
    const secondsRemaining = 60 - now.getSeconds() - now.getMilliseconds() / 1000;
    const delay = Math.max(500, Math.round(secondsRemaining * 1000));
    clockTimer = window.setTimeout(() => {
      clockTimer = null;
      updateClock();
      scheduleClockTick();
    }, delay);
  };

  if (clockElement) {
    updateClock();
    scheduleClockTick();
    if (typeof window !== 'undefined') {
      window.addEventListener('pagehide', clearClockTimer, { once: true });
      window.addEventListener('beforeunload', clearClockTimer, { once: true });
    }
    if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
          updateClock();
          scheduleClockTick();
        }
      });
    }
  }

  const focusableSelectors = [
    'a[href]',
    'area[href]',
    'button:not([disabled])',
    'input:not([disabled])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    'iframe',
    'object',
    'embed',
    '[contenteditable]',
    '[tabindex]'
  ].join(',');

  const isInertSupported = 'inert' in HTMLElement.prototype;

  const isElementVisible = (element) => {
    if (!element) return false;
    if (element.closest('[hidden]')) return false;
    const rects = element.getClientRects();
    if (rects.length === 0) return false;
    const style = window.getComputedStyle(element);
    return style.visibility !== 'hidden' && style.display !== 'none';
  };

  const isElementFocusable = (element) => {
    if (!element) return false;
    if (element.hasAttribute('disabled')) return false;
    if (element.getAttribute('aria-hidden') === 'true') return false;
    if (element.matches('[tabindex="-1"]')) return false;
    return isElementVisible(element);
  };

  const applyFallbackInert = (container) => {
    if (isInertSupported || !container) return;
    container.querySelectorAll(focusableSelectors).forEach((element) => {
      if (!element.hasAttribute('data-inert-tabindex')) {
        const existingTabIndex = element.getAttribute('tabindex');
        if (existingTabIndex !== null) {
          element.setAttribute('data-inert-tabindex', existingTabIndex);
        } else {
          element.setAttribute('data-inert-tabindex', '');
        }
      }
      element.setAttribute('tabindex', '-1');
    });
  };

  const removeFallbackInert = (container) => {
    if (isInertSupported || !container) return;
    container.querySelectorAll('[data-inert-tabindex]').forEach((element) => {
      const originalTabIndex = element.getAttribute('data-inert-tabindex');
      if (originalTabIndex === '') {
        element.removeAttribute('tabindex');
      } else {
        element.setAttribute('tabindex', originalTabIndex);
      }
      element.removeAttribute('data-inert-tabindex');
    });
  };

  const setElementInert = (element) => {
    if (!element) return;
    element.setAttribute('inert', '');
    applyFallbackInert(element);
  };

  const removeElementInert = (element) => {
    if (!element) return;
    element.removeAttribute('inert');
    removeFallbackInert(element);
  };

  const getExternalInertTargets = () => {
    return Array.from(document.body.children).filter((element) => {
      if (element === drawer || element === tab) return false;
      if (element.tagName === 'SCRIPT') return false;
      return true;
    });
  };

  const getFocusableElements = () => {
    const drawerFocusables = Array.from(drawer.querySelectorAll(focusableSelectors)).filter((element) =>
      isElementFocusable(element)
    );
    const focusables = [tab, ...drawerFocusables];
    return focusables.filter((element, index) => element && focusables.indexOf(element) === index);
  };

  const focusWithinTrap = (preferred) => {
    const focusables = getFocusableElements();
    if (preferred && focusables.includes(preferred)) {
      preferred.focus({ preventScroll: true });
      return;
    }
    if (focusables.length > 0) {
      focusables[0].focus({ preventScroll: true });
    } else if (content) {
      content.focus({ preventScroll: true });
    } else {
      drawer.focus({ preventScroll: true });
    }
  };

  let externalInertTargets = [];
  let lastFocusWithin = null;

  const setOpenState = (open) => {
    const currentlyOpen = drawer.classList.contains('is-open');
    const isOpen = typeof open === 'boolean' ? open : !currentlyOpen;

    scheduleTabTopUpdate();

    if (isOpen === currentlyOpen) {
      return;
    }

    drawer.classList.toggle('is-open', isOpen);
    tab.classList.toggle('is-open', isOpen);
    if (scrim && isOpen) {
      scrim.hidden = false;
    }
    if (body) {
      body.classList.toggle('player-tools-open', isOpen);
    }
    drawer.setAttribute('aria-hidden', isOpen ? 'false' : 'true');
    tab.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    if (isOpen) {
      removeElementInert(drawer);
      externalInertTargets = getExternalInertTargets();
      externalInertTargets.forEach(setElementInert);
    } else {
      externalInertTargets.forEach(removeElementInert);
      externalInertTargets = [];
      setElementInert(drawer);
    }
    animateOpenProgress(isOpen ? 1 : 0, () => {
      if (!isOpen && scrim) {
        scrim.hidden = true;
      }
    });

    if (isOpen) {
      focusWithinTrap();
    } else {
      tab.focus({ preventScroll: true });
    }

    if (typeof document?.dispatchEvent === 'function') {
      const detail = { open: isOpen };
      document.dispatchEvent(new CustomEvent('player-tools-drawer-toggle', { detail }));
      document.dispatchEvent(new CustomEvent(isOpen ? 'player-tools-drawer-open' : 'player-tools-drawer-close', { detail }));
    }

    dispatchStateChange(isOpen);
  };

  tab.addEventListener('click', () => {
    setOpenState();
  });

  if (scrim) {
    scrim.addEventListener('click', () => {
      setOpenState(false);
    });
  }

  drawer.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' || event.key === 'Esc') {
      event.stopPropagation();
      event.preventDefault();
      setOpenState(false);
    }
  });

  const trackFocus = (event) => {
    const target = event.target;
    if (drawer.contains(target) || target === tab || tab.contains(target)) {
      lastFocusWithin = target;
    }
  };

  drawer.addEventListener('focusin', trackFocus);
  tab.addEventListener('focusin', trackFocus);

  const handleKeydown = (event) => {
    if (!drawer.classList.contains('is-open')) return;
    if (event.key !== 'Tab') return;
    const focusables = getFocusableElements();
    if (!focusables.length) {
      event.preventDefault();
      (content || drawer).focus({ preventScroll: true });
      return;
    }
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    const active = document.activeElement;
    if (event.shiftKey) {
      if (active === first || (!drawer.contains(active) && active !== tab)) {
        event.preventDefault();
        last.focus({ preventScroll: true });
      }
    } else if (active === last) {
      event.preventDefault();
      first.focus({ preventScroll: true });
    }
  };

  const handleFocusIn = (event) => {
    if (!drawer.classList.contains('is-open')) return;
    const target = event.target;
    if (drawer.contains(target) || target === tab || tab.contains(target)) return;
    event.stopPropagation();
    const fallback = lastFocusWithin && (drawer.contains(lastFocusWithin) || lastFocusWithin === tab || tab.contains(lastFocusWithin))
      ? lastFocusWithin
      : null;
    focusWithinTrap(fallback);
  };

  document.addEventListener('keydown', handleKeydown, true);
  document.addEventListener('focusin', handleFocusIn);

  const handleMotionPreferenceChange = () => {
    const target = drawer.classList.contains('is-open') ? 1 : 0;
    stopOpenAnimation(true);
    applyOpenProgress(target);
    if (!target && scrim) {
      scrim.hidden = true;
    }
  };

  if (motionPreference) {
    if (typeof motionPreference.addEventListener === 'function') {
      motionPreference.addEventListener('change', handleMotionPreferenceChange);
    } else if (typeof motionPreference.addListener === 'function') {
      motionPreference.addListener(handleMotionPreferenceChange);
    }
  }

  if (!drawer.classList.contains('is-open')) {
    setElementInert(drawer);
  }

  dispatchStateChange(drawer.classList.contains('is-open'));

  const subscribe = (listener) => {
    if (typeof listener !== 'function') {
      return () => {};
    }
    const handler = (event) => {
      const detail = event?.detail;
      if (detail && typeof detail.open === 'boolean') {
        listener(detail);
      } else {
        listener({ open: drawer.classList.contains('is-open') });
      }
    };
    stateEvents.addEventListener('change', handler);
    listener({ open: drawer.classList.contains('is-open') });
    return () => {
      stateEvents.removeEventListener('change', handler);
    };
  };

  return {
    open: () => setOpenState(true),
    close: () => setOpenState(false),
    toggle: () => setOpenState(),
    subscribe
  };
}

export function initializePlayerToolsDrawer() {
  if (!controllerInstance) {
    controllerInstance = createPlayerToolsDrawer();
  }
  return controllerInstance;
}

export const open = () => {
  const controller = initializePlayerToolsDrawer();
  if (controller) {
    controller.open();
  }
};

export const close = () => {
  const controller = initializePlayerToolsDrawer();
  if (controller) {
    controller.close();
  }
};

export const toggle = () => {
  const controller = initializePlayerToolsDrawer();
  if (controller) {
    controller.toggle();
  }
};

export const subscribe = (listener) => {
  const controller = initializePlayerToolsDrawer();
  if (controller && typeof controller.subscribe === 'function') {
    return controller.subscribe(listener);
  }
  if (typeof listener === 'function') {
    listener({ open: false });
  }
  return () => {};
};

initializePlayerToolsDrawer();
