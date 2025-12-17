(() => {
  const doc = typeof document !== 'undefined' ? document : null;
  if (!doc) return;

  const launcher = doc.querySelector('[data-pt-launcher]');
  if (!launcher) return;

  const games = new Map();

  const createSizedCanvas = (root, canvas) => {
    const ctx = canvas.getContext('2d');
    const resize = () => {
      const rect = root.getBoundingClientRect();
      const dpr = Math.max(1, window.devicePixelRatio || 1);
      const width = Math.max(1, Math.floor(rect.width * dpr));
      const height = Math.max(1, Math.floor(rect.height * dpr));
      canvas.width = width;
      canvas.height = height;
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.scale(dpr, dpr);
      return { width: rect.width, height: rect.height, ctx };
    };
    return { ctx, resize };
  };

  const drawFrame = (ctx, size, label, accent) => {
    ctx.clearRect(0, 0, size.width, size.height);
    const gradient = ctx.createLinearGradient(0, 0, size.width, size.height);
    gradient.addColorStop(0, `rgba(${accent.join(',')},0.65)`);
    gradient.addColorStop(1, 'rgba(20,22,32,0.9)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size.width, size.height);

    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.font = '700 18px "Race Sport", "Inter", system-ui, sans-serif';
    ctx.fillText(label, 16, 30);

    ctx.font = '500 14px "Inter", system-ui, sans-serif';
    const copy = 'Stay within the faux viewport. Drag or tap the canvas to interact.';
    wrapText(ctx, copy, 16, 56, Math.max(120, size.width - 32), 20);
  };

  const wrapText = (ctx, text, x, y, maxWidth, lineHeight) => {
    const words = text.split(' ');
    let line = '';
    let cursorY = y;
    for (let i = 0; i < words.length; i++) {
      const testLine = line + words[i] + ' ';
      const metrics = ctx.measureText(testLine);
      if (metrics.width > maxWidth && i > 0) {
        ctx.fillText(line, x, cursorY);
        line = words[i] + ' ';
        cursorY += lineHeight;
      } else {
        line = testLine;
      }
    }
    ctx.fillText(line, x, cursorY);
  };

  const createGameController = (root) => {
    const canvas = root.querySelector('[data-pt-game-canvas]');
    const hud = root.querySelector('[data-pt-game-hud]');
    if (!canvas || !hud) return null;

    const label = (root.getAttribute('data-pt-game') || 'Game').toUpperCase();
    const accent = [Math.floor(Math.random() * 120) + 80, 120, 255];
    const sized = createSizedCanvas(root, canvas);
    let size = { width: 0, height: 0, ctx: sized.ctx };
    let ro = null;

    const setHud = (msg) => {
      hud.textContent = msg;
    };

    const render = () => {
      drawFrame(size.ctx, size, label, accent);
    };

    const resize = () => {
      const dims = sized.resize();
      size = { width: dims.width, height: dims.height, ctx: dims.ctx };
      render();
    };

    const reset = () => {
      setHud('Reset and ready.');
      render();
    };

    const handlePointer = (e) => {
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      setHud(`Pointer at ${Math.round(x)}, ${Math.round(y)}`);
    };

    const attach = () => {
      if (ro) return;
      ro = new ResizeObserver(resize);
      ro.observe(root);
      canvas.addEventListener('pointermove', handlePointer, { passive: true });
      canvas.addEventListener('pointerdown', handlePointer, { passive: true });
      resize();
      setHud('In-viewport play active.');
    };

    const detach = () => {
      if (ro) {
        try { ro.disconnect(); } catch (_) {}
        ro = null;
      }
      canvas.removeEventListener('pointermove', handlePointer);
      canvas.removeEventListener('pointerdown', handlePointer);
      setHud('');
    };

    return { attach, detach, reset };
  };

  const ensureGame = (root) => {
    if (games.has(root)) return games.get(root);
    const controller = createGameController(root);
    if (controller) games.set(root, controller);
    return controller;
  };

  const findGamesIn = (modal) => Array.from(modal.querySelectorAll('.pt-game'));

  const handleModalOpen = (modal) => {
    findGamesIn(modal).forEach((root) => {
      const controller = ensureGame(root);
      controller?.attach();
    });
  };

  const handleModalClose = (modal) => {
    findGamesIn(modal).forEach((root) => {
      const controller = games.get(root);
      controller?.detach();
    });
  };

  doc.addEventListener('click', (e) => {
    const resetBtn = e.target.closest('[data-pt-game-reset]');
    if (resetBtn) {
      const modal = resetBtn.closest('.pt-modal');
      if (!modal) return;
      findGamesIn(modal).forEach((root) => games.get(root)?.reset());
    }
  });

  window.addEventListener('cc:pt-modal-opened', (e) => {
    const modal = e?.detail?.modal;
    if (!modal || !launcher.contains(modal)) return;
    handleModalOpen(modal);
  });

  window.addEventListener('cc:pt-modal-closed', (e) => {
    const modal = e?.detail?.modal;
    if (!modal || !launcher.contains(modal)) return;
    handleModalClose(modal);
  });
})();
