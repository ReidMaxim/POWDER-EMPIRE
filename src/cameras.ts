import * as T from 'three';
import { HALF, type Heightmap } from './terrain';

const clamp = T.MathUtils.clamp;
const mix = T.MathUtils.lerp;
const approach = (value: number, target: number, t: number) => Math.abs(value - target) < .0001 ? target : mix(value, target, t);
const radians = T.MathUtils.degToRad;
const isoPitch = Math.atan(1 / Math.sqrt(2));
const initialYaw = -Math.PI / 4;
const home = new T.Vector3(-16, 160, -32);

export class ResortCameras {
  private readonly ortho = new T.OrthographicCamera(-1, 1, 1, -1, 1, 14500);
  private readonly perspective = new T.PerspectiveCamera(38, 1, 1, 14500);
  private readonly focus = home.clone();
  private readonly shownFocus = home.clone();
  private readonly offset = new T.Vector3();
  private aspect = 1;
  private height = 1;
  private yaw = initialYaw;
  private shownYaw = initialYaw;
  private pitch = isoPitch;
  private shownPitch = isoPitch;
  private span = 1160;
  private shownSpan = 1160;
  private blend = 0;
  private dragging = false;
  fogNear = 0;
  explore = false;
  reducedMotion = false;

  resize(width: number, height: number) {
    this.aspect = width / Math.max(1, height);
    this.height = height;
  }

  switchMode() {
    this.explore = !this.explore;
    this.pitch = this.explore ? .44 : isoPitch;
    if (!this.explore) this.yaw = initialYaw + Math.round((this.yaw - initialYaw) / (Math.PI / 2)) * Math.PI / 2;
  }

  reset() {
    this.focus.copy(home);
    this.yaw = initialYaw + Math.round((this.shownYaw - initialYaw) / (2 * Math.PI)) * 2 * Math.PI;
    this.pitch = this.explore ? .44 : isoPitch;
    this.span = 1160;
  }

  rotate(turn: number) {
    this.yaw += turn * Math.PI / 2;
  }

  zoom(amount: number) {
    this.span = clamp(this.span * Math.exp(amount), 76, 1600);
  }

  setDragging(active: boolean) {
    this.dragging = active;
  }

  drag(dx: number, dy: number, pan: boolean) {
    if (this.explore && !pan) {
      this.yaw -= dx * .007;
      this.pitch = clamp(this.pitch + dy * .006, .14, 1.31);
      return;
    }
    const scale = this.fittedSpan(this.span) / this.height;
    const right = dx * scale, forward = dy * scale / Math.max(.2, Math.sin(this.shownPitch));
    this.focus.x = clamp(this.focus.x - Math.cos(this.shownYaw) * right - Math.sin(this.shownYaw) * forward, -HALF, HALF);
    this.focus.z = clamp(this.focus.z + Math.sin(this.shownYaw) * right - Math.cos(this.shownYaw) * forward, -HALF, HALF);
  }

  private fittedSpan(span: number) {
    return span * Math.max(1, 1.30 / this.aspect);
  }

  update(dt: number, map: Heightmap): T.Camera {
    const smooth = this.reducedMotion ? 1 : 1 - Math.exp(-dt * 13);
    const inputSmooth = this.dragging ? 1 : smooth;
    this.blend = mix(this.blend, Number(this.explore), smooth);
    if (this.blend < .001) this.blend = 0;
    if (this.blend > .999) this.blend = 1;
    this.focus.y = mix(160, Math.max(105, map.sample(this.focus.x, this.focus.z).elevation + 25), this.blend);
    if (this.shownFocus.distanceToSquared(this.focus) < .001) this.shownFocus.copy(this.focus);
    else this.shownFocus.lerp(this.focus, inputSmooth);

    this.shownYaw = approach(this.shownYaw, this.yaw, inputSmooth);
    this.shownPitch = approach(this.shownPitch, this.pitch, inputSmooth);
    this.shownSpan = approach(this.shownSpan, this.span, smooth);
    const mobileBlend = clamp((this.aspect - .55) / .60, 0, 1);
    const span = this.fittedSpan(this.shownSpan) * mix(1, mix(.57, .78, mobileBlend), this.blend);
    const viewHeight = span / 2;
    const distance = this.blend === 0 ? 4900 : mix(4900, viewHeight / Math.tan(radians(38 / 2)), this.blend);
    this.fogNear = distance * .89 + 180;
    const cp = Math.cos(this.shownPitch);
    this.offset.set(Math.sin(this.shownYaw) * cp, Math.sin(this.shownPitch), Math.cos(this.shownYaw) * cp);
    const camera = this.blend === 0 ? this.ortho : this.perspective;
    camera.position.copy(this.shownFocus).addScaledVector(this.offset, distance);
    if (this.blend > 0) {
      const floor = map.sample(camera.position.x, camera.position.z).elevation + 24;
      camera.position.y = Math.max(floor, camera.position.y);
      this.perspective.aspect = this.aspect;
      this.perspective.fov = T.MathUtils.radToDeg(2 * Math.atan(viewHeight / camera.position.distanceTo(this.shownFocus)));
    } else {
      this.ortho.left = -viewHeight * this.aspect;
      this.ortho.right = viewHeight * this.aspect;
      this.ortho.top = viewHeight;
      this.ortho.bottom = -viewHeight;
    }
    camera.lookAt(this.shownFocus);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
    return camera;
  }
}
