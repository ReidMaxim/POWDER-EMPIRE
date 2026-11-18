import type { ResortCameras } from './cameras';

export function bindControls(
  canvas: HTMLCanvasElement, cameras: ResortCameras, dialog: HTMLDialogElement,
  inspect: (x: number, y: number) => void, switchMode: () => void
) {
  const pointers = new Map<number, { x: number; y: number }>();
  let click: { x: number; y: number } | undefined;
  const distance = () => {
    const [a, b] = pointers.values();
    return Math.hypot(a.x - b.x, a.y - b.y);
  };
  canvas.addEventListener('contextmenu', event => event.preventDefault());
  canvas.addEventListener('pointerdown', event => {
    canvas.setPointerCapture(event.pointerId);
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    click = pointers.size === 1 && event.button === 0 ? { x: event.clientX, y: event.clientY } : undefined;
    cameras.setDragging(true);
    canvas.classList.add('dragging');
  });
  canvas.addEventListener('pointermove', event => {
    const previous = pointers.get(event.pointerId);
    if (!previous) return;
    const x = event.clientX, y = event.clientY;
    const before = pointers.size === 2 ? distance() : 0;
    pointers.set(event.pointerId, { x, y });
    if (before) {
      cameras.zoom(Math.log(Math.max(4, before) / Math.max(4, distance())));
      cameras.drag((x - previous.x) / 2, (y - previous.y) / 2, true);
      return;
    }
    if (pointers.size !== 1) return;
    if (click && Math.hypot(x - click.x, y - click.y) < 5) return;
    const origin = click ?? previous;
    click = undefined;
    cameras.drag(x - origin.x, y - origin.y, event.shiftKey || (event.buttons & 6) !== 0);
  });
  const finish = (event: PointerEvent) => {
    if (!pointers.delete(event.pointerId)) return;
    if (click && event.type === 'pointerup') inspect(event.clientX, event.clientY);
    click = undefined;
    if (pointers.size) return;
    cameras.setDragging(false);
    canvas.classList.remove('dragging');
  };
  for (const name of ['pointerup', 'pointercancel', 'lostpointercapture'] as const) canvas.addEventListener(name, finish);
  canvas.addEventListener('wheel', event => {
    event.preventDefault();
    const units = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 200 : 1;
    cameras.zoom(Math.max(-.5, Math.min(.5, event.deltaY * units * .0013)));
  }, { passive: false });
  window.addEventListener('keydown', event => {
    if (dialog.open || event.altKey || event.ctrlKey || event.metaKey) return;
    switch (event.key.toLowerCase()) {
      case 'v': if (!event.repeat) switchMode(); break;
      case 'q': if (!event.repeat) cameras.rotate(-1); break;
      case 'e': if (!event.repeat) cameras.rotate(1); break;
      case 'home': cameras.reset(); break;
      case '+': case '=': cameras.zoom(-.18); break;
      case '-': cameras.zoom(.18); break;
      case 'arrowleft': cameras.drag(-25, 0, true); break;
      case 'arrowright': cameras.drag(25, 0, true); break;
      case 'arrowup': cameras.drag(0, -25, true); break;
      case 'arrowdown': cameras.drag(0, 25, true); break;
      default: return;
    }
    event.preventDefault();
  });
}
