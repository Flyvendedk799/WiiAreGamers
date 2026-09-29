// Phone motion, reported the way a Wii remote is.
//
// Looking down at the screen is the remote lying flat, buttons up.
// The top edge toward the sky is the remote standing up, which is the bat.
//
// The gyro turns that pose with the phone. Gravity keeps the tilt honest,
// including through a swing, so pointing the tip up, holding it flat, or
// twisting the face are different orientations.
//
// A swing is the acceleration the hand actually feels. That keeps a
// sideways shot, an upward shot, and a twist on different axes. Spinning
// the phone in place does not move the sensor, so that case uses the way
// the tip is moving. The stop at the end of a swing is quieter than the
// swing, so it is not reported as the opposite shot.

const G = 9.80665;
const DEG = Math.PI / 180;
const MAX_TIP_G = 2.2;
const MAX_LINEAR_G = 2.2;
const LINEAR_DEAD_G = 0.2;
const SWING_RATE = 1.2;
const REST_RATE = 0.4;

export type Vec3 = { x: number; y: number; z: number };
export type GyroOut = { pitch: number; yaw: number; roll: number };

export type MotionSensors = {
    accel: { x: number | null; y: number | null; z: number | null } | null;
    rotationRate: { alpha: number | null; beta: number | null; gamma: number | null } | null;
};

function vlen(v: Vec3) {
    return Math.hypot(v.x, v.y, v.z);
}

function vadd(a: Vec3, b: Vec3): Vec3 {
    return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

function vscale(v: Vec3, s: number): Vec3 {
    return { x: v.x * s, y: v.y * s, z: v.z * s };
}

function vcross(a: Vec3, b: Vec3): Vec3 {
    return {
        x: a.y * b.z - a.z * b.y,
        y: a.z * b.x - a.x * b.z,
        z: a.x * b.y - a.y * b.x
    };
}

function vnorm(v: Vec3): Vec3 {
    const m = vlen(v) || 1;
    return vscale(v, 1 / m);
}

function vdot(a: Vec3, b: Vec3) {
    return a.x * b.x + a.y * b.y + a.z * b.z;
}

function limitLength(v: Vec3, limit: number): Vec3 {
    const m = vlen(v);
    return m > limit ? vscale(v, limit / m) : v;
}

// Phone axes are X right, Y toward the top, Z out of the screen.
// Packet Y is the button face. Packet Z is the length of the remote.
export function phoneToPacket(phone: Vec3): Vec3 {
    return { x: phone.x, y: phone.z, z: -phone.y };
}

// The phone's accelerometer already feels the hand moving. That is the
// remote's swing when the handle itself travels (a side-to-side shot
// while the remote is standing up). Gravity is removed so a held pose
// does not look like a shove.
function linearAccel(measured: Vec3, gravity: Vec3): Vec3 {
    const extra = {
        x: measured.x - gravity.x,
        y: measured.y - gravity.y,
        z: measured.z - gravity.z
    };
    if (vlen(extra) < LINEAR_DEAD_G) return { x: 0, y: 0, z: 0 };
    return limitLength(extra, MAX_LINEAR_G);
}

// Wrist rotation that is not along the handle. Direction follows the tip
// for the whole swing. Twisting around the handle moves no tip.
function swingAccel(omega: Vec3): Vec3 {
    const moving = vcross(omega, { x: 0, y: 1, z: 0 });
    const movingLen = vlen(moving);
    if (movingLen < 1e-4) return { x: 0, y: 0, z: 0 };

    const speed = vlen(omega);
    const span = 10 - SWING_RATE;
    const amount = Math.max(0, Math.min(1, (speed - SWING_RATE) / span));
    const intensity = amount * 2.2;
    const directional = vscale(moving, intensity / movingLen);
    const towardHand = limitLength(vscale(vcross(omega, moving), 1 / G), intensity * 0.35);
    return limitLength(vadd(directional, towardHand), MAX_TIP_G);
}

export class WiimoteMotionEngine {
    // Screen-up rest: specific force points out the back of the phone.
    private gravity: Vec3 = { x: 0, y: 0, z: -1 };
    private omega: Vec3 = { x: 0, y: 0, z: 0 };
    private bias: Vec3 = { x: 0, y: 0, z: 0 };
    private prevTime = 0;
    private linear: Vec3 = { x: 0, y: 0, z: 0 };
    // Direction of the current swing. A short stop cannot take it over.
    // A push the other way that keeps going can.
    private drive: Vec3 | null = null;
    private driveMag = 0;
    private quietMs = 0;
    private oppositeMs = 0;

    update(sensors: MotionSensors, nowMs: number): { accel: Vec3; gyro: GyroOut } {
        const acc = sensors.accel;
        const rot = sensors.rotationRate;
        const measured = {
            x: (acc?.x || 0) / G,
            y: (acc?.y || 0) / G,
            z: (acc?.z || 0) / G
        };
        const measuredMag = vlen(measured);
        const measuredHat = vnorm(measured);
        const near1g = measuredMag > 0.75 && measuredMag < 1.35;

        const raw = {
            x: (rot?.beta || 0) * DEG,
            y: (rot?.gamma || 0) * DEG,
            z: (rot?.alpha || 0) * DEG
        };
        const unbiased = {
            x: raw.x - this.bias.x,
            y: raw.y - this.bias.y,
            z: raw.z - this.bias.z
        };

        const dt = this.prevTime > 0 ? (nowMs - this.prevTime) / 1000 : 0;
        this.prevTime = nowMs;
        const dtOk = dt >= 0.008 && dt <= 0.08;

        const follow = vlen(unbiased) > SWING_RATE ? 0.9 : 0.5;
        const omega = {
            x: this.omega.x * (1 - follow) + unbiased.x * follow,
            y: this.omega.y * (1 - follow) + unbiased.y * follow,
            z: this.omega.z * (1 - follow) + unbiased.z * follow
        };
        const speed = vlen(omega);
        // A shove with a still wrist is still a swing. Gravity must not
        // swallow it just because the gyro is quiet.
        const shove = vlen({
            x: measured.x - this.gravity.x,
            y: measured.y - this.gravity.y,
            z: measured.z - this.gravity.z
        });
        const resting = near1g && speed < REST_RATE && shove < 0.35;

        if (resting) {
            const learn = 0.06;
            this.bias = vadd(vscale(this.bias, 1 - learn), vscale(raw, learn));
        }

        if (dt === 0 && near1g) {
            this.gravity = measuredHat;
        } else if (dtOk) {
            // Gravity in the phone frame turns opposite the gyro.
            // The phone's own accelerometer stays near 1G through a wrist
            // swing, so it keeps the tilt. Only a hard shove of the whole
            // phone is ignored.
            const rotated = vadd(this.gravity, vscale(vcross(omega, this.gravity), -dt));
            const accelTrust = !near1g ? 0.02 : resting ? 0.5 : 0.08;
            const anchor = near1g ? measuredHat : rotated;
            this.gravity = vnorm(vadd(vscale(rotated, 1 - accelTrust), vscale(anchor, accelTrust)));
        }

        // The accelerometer is where a remote's accelerometer sits, so it
        // already has the swing. Adding a tip estimate on top of that pulls
        // every shot toward the same diagonal. Use the tip only when the
        // phone is spinning in place and the sensor feels nothing.
        const felt = linearAccel(measured, this.gravity);
        const tip = speed >= SWING_RATE ? swingAccel(omega) : { x: 0, y: 0, z: 0 };
        let sensed = vlen(felt) >= LINEAR_DEAD_G ? felt : tip;
        const sensedMag = vlen(sensed);
        const stepMs = (dtOk ? dt : 0.016) * 1000;
        if (sensedMag >= LINEAR_DEAD_G) {
            // A held pose is 1g. A moderate swing is smaller than that, so the
            // total vector still points along the remote and both directions
            // look alike. Once the swing is clearly underway, raise it so its
            // own axis wins. A short stop is dropped. A push the other way
            // that keeps going becomes the new swing, even if the wrist is
            // still turning.
            if (!this.drive) {
                if (sensedMag >= 0.55) {
                    this.drive = vnorm(sensed);
                    this.driveMag = sensedMag;
                }
                this.oppositeMs = 0;
            } else if (vdot(sensed, this.drive) < 0) {
                this.oppositeMs += stepMs;
                if (this.oppositeMs > 120 && sensedMag >= 0.55) {
                    this.drive = vnorm(sensed);
                    this.driveMag = sensedMag;
                    this.oppositeMs = 0;
                } else {
                    sensed = { x: 0, y: 0, z: 0 };
                }
            } else {
                this.oppositeMs = 0;
                if (sensedMag > this.driveMag) {
                    this.drive = vnorm(sensed);
                    this.driveMag = sensedMag;
                }
            }
            if (this.drive && vdot(sensed, this.drive) > 0 && vlen(sensed) >= 0.55) {
                const mag = vlen(sensed);
                const target = Math.min(MAX_TIP_G, Math.max(mag, 1.7));
                sensed = vscale(sensed, target / mag);
            }
            this.quietMs = 0;
        } else if (speed < SWING_RATE) {
            this.quietMs += stepMs;
            this.oppositeMs = 0;
            if (this.quietMs > 100) {
                this.drive = null;
                this.driveMag = 0;
            }
        } else {
            this.oppositeMs = 0;
        }
        const followLinear = resting ? 0.7 : 0.55;
        this.linear = vadd(vscale(this.linear, 1 - followLinear), vscale(sensed, followLinear));
        this.omega = omega;

        // Dolphin turns each gyro axis into (down - up), which doubles it and
        // flips the sign. Half-scale here is the rate the game should integrate,
        // in the same frame as the tilt: pitch around phone X, roll around
        // phone Y, yaw around phone Z.
        const gyro: GyroOut = resting
            ? { pitch: 0, yaw: 0, roll: 0 }
            : {
                pitch: (omega.x / DEG) * 0.5,
                roll: (omega.y / DEG) * 0.5,
                yaw: -(omega.z / DEG) * 0.5
            };

        return {
            accel: vadd(phoneToPacket(this.gravity), phoneToPacket(limitLength(this.linear, MAX_TIP_G))),
            gyro
        };
    }
}
