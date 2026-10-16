// Device fit and launch gate. Full screen and orientation locking must be
// requested from a user gesture, so the gate provides that gesture when needed.
(() => {
    const gate = document.getElementById('device-gate');
    const action = document.getElementById('device-gate-action');
    const message = document.getElementById('device-gate-message');
    const hasTouch = navigator.maxTouchPoints > 0 || 'ontouchstart' in window;
    document.documentElement.classList.toggle('has-touch', hasTouch);
    document.documentElement.classList.toggle('coarse-pointer', matchMedia('(pointer: coarse)').matches);

    function landscape() {
        return matchMedia('(orientation: landscape)').matches ||
            (screen.orientation && screen.orientation.type.startsWith('landscape'));
    }

    function fullscreen() {
        return Boolean(document.fullscreenElement || document.webkitFullscreenElement || navigator.standalone);
    }

    function update() {
        const needsFullscreen = !fullscreen();
        const needsLandscape = !landscape();
        const canRequestFullscreen = Boolean(document.documentElement.requestFullscreen || document.documentElement.webkitRequestFullscreen);
        gate.hidden = !needsFullscreen && !needsLandscape;
        message.textContent = needsLandscape
            ? 'Rotate your device to landscape, then enter full screen to continue.'
            : canRequestFullscreen
                ? 'Enter full screen to continue.'
                : 'Use your browser’s full screen option, then return here to continue.';
        action.textContent = needsLandscape ? 'Rotate to landscape' : canRequestFullscreen ? 'Enter full screen' : 'Full screen unavailable';
        action.disabled = needsLandscape || !canRequestFullscreen;
    }

    action.addEventListener('click', async () => {
        const root = document.documentElement;
        try {
            if (root.requestFullscreen) await root.requestFullscreen();
            else if (root.webkitRequestFullscreen) root.webkitRequestFullscreen();
        } catch (_) { /* The browser may require a fresh user gesture. */ }
        try {
            if (screen.orientation?.lock) await screen.orientation.lock('landscape');
        } catch (_) { /* Rotation can still be done manually. */ }
        update();
    });

    document.addEventListener('fullscreenchange', update);
    document.addEventListener('webkitfullscreenchange', update);
    window.addEventListener('resize', update);
    screen.orientation?.addEventListener?.('change', update);
    if (hasTouch && matchMedia('(max-width: 760px)').matches && typeof setNationPanelMinimized === 'function') {
        setNationPanelMinimized(true);
    }
    update();
})();
