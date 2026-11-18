import * as T from 'three';
import { HALF, type Heightmap } from './terrain.ts';

const clamp = T.MathUtils.clamp;
const mix = T.MathUtils.lerp;
const approach = (value: number, target: number, t: number) => Math.abs(value - target) < .0001 ? target : mix(value, target, t);
const radians = T.MathUtils.degToRad;
const isoPitch = Math.atan(1 / Math.sqrt(2));
const initialYaw = -Math.PI / 4;
const home = new T.Vector3(0, 147, -18);
const overviewSpan = 1200;
const nearExploreSpan = 38;
const clearance = 6;
export const EXPLORE_PITCH = Object.freeze({ min: -Math.PI / 3, max: 1.31 });

export class ResortCameras {
  private readonly ortho = new T.OrthographicCamera(-1, 1, 1, -1, 1, 14500);
  private readonly perspective = new T.PerspectiveCamera(38, 1, 1, 14500);
  private readonly focus = home.clone();
  private readonly shownFocus = home.clone();
  private readonly offset = new T.Vector3();
  private tracked?: { x:number; y:number; z:number };
  private readonly trackedFocus = new T.Vector3();
  private trackingSpan = 110;
  private trackingYaw = Math.PI/4;
  private trackingPitch = .44;
  track(target?:{x:number;y:number;z:number}) {
    if (target && !this.tracked) {
      this.trackingSpan = 110;
      this.trackingYaw = Math.PI/4 + Math.round((this.shownYaw-Math.PI/4)/(2*Math.PI))*2*Math.PI;
      this.trackingPitch = .44;
    }
    this.tracked = target;
  }
  private readonly gaze = new T.Vector3();
  private aspect = 1;
  private height = 1;
  private yaw = initialYaw;
  private shownYaw = initialYaw;
  private pitch = isoPitch;
  private shownPitch = isoPitch;
  private worldHalf = HALF;
  private overviewHeight = home.y;
  private span = overviewSpan;
  private shownSpan = overviewSpan;
  private blend = 0;
  private dragging = false;
  fogNear = 0;
  explore = false;
  reducedMotion = false;

  setWorldSpan(span: number) {
    this.worldHalf = span / 2;
    this.overviewHeight = home.y + (span - 2 * HALF) * .10;
  }

  resize(width: number, height: number) {
    this.aspect = width / Math.max(1, height);
    this.height = height;
  }

  switchMode() {
    this.explore = !this.explore;
    this.pitch = this.explore ? .44 : isoPitch;
    if (!this.explore) {
      this.yaw = initialYaw + Math.round((this.yaw - initialYaw) / (Math.PI / 2)) * Math.PI / 2;
      this.span = Math.max(76, this.span);
    }
  }

  reset() {
    this.focus.copy(home);
    this.yaw = initialYaw + Math.round((this.shownYaw - initialYaw) / (2 * Math.PI)) * 2 * Math.PI;
    this.pitch = this.explore ? .44 : isoPitch;
    this.span = overviewSpan*this.worldHalf/HALF;
  }

  rotate(turn: number) {
    if (this.tracked) this.trackingYaw += turn * Math.PI/2;
    else this.yaw += turn * Math.PI / 2;
  }

  zoom(amount: number) {
    if (this.tracked) this.trackingSpan = clamp(this.trackingSpan*Math.exp(amount),55,600);
    else this.span = clamp(this.span * Math.exp(amount), this.explore ? nearExploreSpan : 76, 1600*this.worldHalf/HALF);
  }

  setDragging(active: boolean) {
    this.dragging = active;
  }

  drag(dx: number, dy: number, pan: boolean) {
    if (this.explore && !pan) {
      if (this.tracked) {
        this.trackingYaw -= dx*.007;
        this.trackingPitch = clamp(this.trackingPitch+dy*.006,EXPLORE_PITCH.min,EXPLORE_PITCH.max);
      } else {
        this.yaw -= dx * .007;
        this.pitch = clamp(this.pitch + dy * .006, EXPLORE_PITCH.min, EXPLORE_PITCH.max);
      }
      return;
    }
    const scale = this.fittedSpan(this.span) / this.height;
    const right = dx * scale, forward = dy * scale / Math.max(.2, Math.abs(Math.sin(this.shownPitch)));
    this.focus.x = clamp(this.focus.x - Math.cos(this.shownYaw) * right - Math.sin(this.shownYaw) * forward, -this.worldHalf, this.worldHalf);
    this.focus.z = clamp(this.focus.z + Math.sin(this.shownYaw) * right - Math.cos(this.shownYaw) * forward, -this.worldHalf, this.worldHalf);
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
    this.shownSpan = approach(this.shownSpan, this.tracked ? this.trackingSpan : this.span, smooth);
    const ground = map.sample(this.focus.x, this.focus.z).elevation;
    const nearGround = 1 - T.MathUtils.smoothstep(this.shownSpan, 90, 380);
    const exploreHeight = mix(Math.max(105, ground + 25), ground + 12, nearGround);
    this.focus.y = mix(this.overviewHeight, exploreHeight, this.blend);
    const target = this.tracked ? this.trackedFocus.set(this.tracked.x,this.tracked.y+3,this.tracked.z) : this.focus;
    if (this.shownFocus.distanceToSquared(target) < .001) this.shownFocus.copy(target);
    else this.shownFocus.lerp(target, inputSmooth);

    this.shownYaw = approach(this.shownYaw, this.tracked ? this.trackingYaw : this.yaw, inputSmooth);
    this.shownPitch = approach(this.shownPitch, this.tracked ? this.trackingPitch : this.pitch, inputSmooth);
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
      // A small footprint protects the near plane on steep terrain. Preserve the
      // requested gaze when lifting the eye, including when orbiting below the target.
      const { x, z } = camera.position;
      const radius = 2;
      const floor = Math.max(
        map.sample(x, z).elevation,
        map.sample(x - radius, z - radius).elevation,
        map.sample(x + radius, z - radius).elevation,
        map.sample(x - radius, z + radius).elevation,
        map.sample(x + radius, z + radius).elevation
      );
      camera.position.y = Math.max(floor + clearance, camera.position.y);
      this.gaze.copy(camera.position).addScaledVector(this.offset, -distance);
      this.perspective.aspect = this.aspect;
      this.perspective.fov = T.MathUtils.radToDeg(2 * Math.atan(viewHeight / distance));
    } else {
      this.ortho.left = -viewHeight * this.aspect;
      this.ortho.right = viewHeight * this.aspect;
      this.ortho.top = viewHeight;
      this.ortho.bottom = -viewHeight;
    }
    camera.lookAt(this.blend > 0 ? this.gaze : this.shownFocus);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
    return camera;
  }
}
