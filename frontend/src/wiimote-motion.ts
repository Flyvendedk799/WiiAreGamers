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

function swingTarget(strength: number) {
    const amount = Math.max(0, Math.min(1, (strength - 0.55) / (MAX_TIP_G - 0.55)));
    // A light pull stays quieter than a hard hit, so the game can tell
    // them apart. Both still clear a held pose.
    return Math.min(MAX_TIP_G, 0.9 + amount * (MAX_TIP_G - 0.9));
}

// Across the handle stays on the latched direction so the stop cannot flip it.
// A clear shove along the handle is kept, so a side swing that also goes up
// or down does not collapse into a flat one. A mild pull toward the hand is
// left out, because both side directions share that pull.
function sideAndAgainst(drive: Vec3, strength: number, alongHandle: number): Vec3 {
    const lateral = vscale(drive, swingTarget(strength));
    let along = 0;
    if (alongHandle >= 0.55) along = Math.min(alongHandle, MAX_TIP_G);
    else if (alongHandle <= -1.05) along = Math.max(alongHandle, -MAX_TIP_G);
    if (along === 0) return lateral;
    return vadd(lateral, { x: 0, y: along, z: 0 });
}

function poseClear(gravity: Vec3, linear: Vec3): Vec3 {
    const pose = phoneToPacket(gravity);
    const motion = phoneToPacket(limitLength(linear, MAX_TIP_G));
    const sum = vadd(pose, motion);
    const poseHat = vnorm(pose);
    const along = vdot(sum, poseHat);
    const motionLen = vlen(motion);
    const align = motionLen > 0.2 ? vdot(motion, poseHat) / motionLen : 0;
    // Only a swing aimed against the pose. A sideways shot can lean across
    // the pose as the phone turns, and that must not become a down swing.
    if (align < -0.7) {
        // Far enough past the pose to read as a swing, and further when
        // the swing is harder. A fixed push made every down swing identical.
        const push = Math.min(1.6, 0.3 + Math.max(0, motionLen - 0.5) * 0.9);
        if (along > -push) return vadd(sum, vscale(poseHat, -push - along));
    }
    return sum;
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

// Wrist rotation that is not along the handle. Strength follows how fast
// the tip is moving. A twist around the handle is not turned into a swing
// just because the wrist is spinning quickly.
function swingAccel(omega: Vec3): Vec3 {
    const moving = vcross(omega, { x: 0, y: 1, z: 0 });
    const movingLen = vlen(moving);
    if (movingLen < 1e-4) return { x: 0, y: 0, z: 0 };

    const span = 10 - SWING_RATE;
    const amount = Math.max(0, Math.min(1, (movingLen - SWING_RATE) / span));
    const intensity = amount * 2.2;
    return vscale(moving, intensity / movingLen);
}

export class WiimoteMotionEngine {
    // Screen-up rest: specific force points out the back of the phone.
    private gravity: Vec3 = { x: 0, y: 0, z: -1 };
    private omega: Vec3 = { x: 0, y: 0, z: 0 };
    private bias: Vec3 = { x: 0, y: 0, z: 0 };
    private prevTime = 0;
    private linear: Vec3 = { x: 0, y: 0, z: 0 };
    // Direction of the current swing. Slowing down does not take it over.
    // The other direction starts after this swing has gone quiet.
    private drive: Vec3 | null = null;
    private driveMag = 0;
    private driveIsHoriz = false;
    // When this swing became the shot. A harder opposite in the next
    // instant can still be the hit. After that, it is the stop.
    private driveAt = 0;
    // True while an up or down swing is still in progress. A quiet gap
    // clears it, so the next shot can be the other way.
    private shaftContinuing = false;
    private quietMs = 0;
    private oppositeMs = 0;
    // Time the only acceleration has been along the handle. Both swing
    // directions share that pull, so it is not a shot until it keeps going.
    private verticalMs = 0;
    // Sideways can be the smaller part of a swing. It counts once it holds
    // still in one direction, so a wobble does not become the shot.
    private horizHoldMs = 0;
    private horizHold: Vec3 | null = null;
    private prevHoriz: Vec3 | null = null;
    // An up or down flick is held for one sample. If the next sample is
    // sideways, the flick was the pull toward the hand and is dropped.
    private pendingShaft: { y: number; mag: number; seen: number } | null = null;
    // A light sideways pull is held here until it is clearly the shot.
    // A harder swing the other way can replace it before it is sent.
    private pendingHoriz: { hat: Vec3; mag: number; seen: number } | null = null;
    // How long a near-1g reading has stayed still. That is a new pose,
    // not a swing that forgot to end.
    private poseMs = 0;
    private poseDir: Vec3 | null = null;
    private last: { accel: Vec3; gyro: GyroOut } = {
        accel: { x: 0, y: -1, z: 0 },
        gyro: { pitch: 0, yaw: 0, roll: 0 }
    };

    update(sensors: MotionSensors, nowMs: number): { accel: Vec3; gyro: GyroOut } {
        const acc = sensors.accel;
        const rot = sensors.rotationRate;
        // A missing axis is not zero. Zero would be read as a shove
        // straight out of the pose.
        if (acc == null || acc.x == null || acc.y == null || acc.z == null) {
            return this.last;
        }
        const measured = {
            x: acc.x / G,
            y: acc.y / G,
            z: acc.z / G
        };
        const measuredMag = vlen(measured);
        // No gravity in this sample. User acceleration without gravity
        // sits at zero when the phone is still, and that is not a down swing.
        if (measuredMag < 0.2) return this.last;
        const measuredHat = vnorm(measured);
        const near1g = measuredMag > 0.75 && measuredMag < 1.35;

        const gyroMissing = !rot || (rot.alpha == null && rot.beta == null && rot.gamma == null);
        const raw = {
            x: gyroMissing ? 0 : (rot.beta || 0) * DEG,
            y: gyroMissing ? 0 : (rot.gamma || 0) * DEG,
            z: gyroMissing ? 0 : (rot.alpha || 0) * DEG
        };
        const unbiased = gyroMissing ? this.omega : {
            x: raw.x - this.bias.x,
            y: raw.y - this.bias.y,
            z: raw.z - this.bias.z
        };

        const dt = this.prevTime > 0 ? (nowMs - this.prevTime) / 1000 : 0;
        this.prevTime = nowMs;
        // A phone often delivers motion faster than 8ms. That is still the
        // same swing. Only a real gap, or the first sample, is a pose snap.
        const dtOk = dt > 0 && dt <= 0.08;

        const follow = vlen(unbiased) > SWING_RATE ? 0.9 : 0.5;
        const omega = {
            x: this.omega.x * (1 - follow) + unbiased.x * follow,
            y: this.omega.y * (1 - follow) + unbiased.y * follow,
            z: this.omega.z * (1 - follow) + unbiased.z * follow
        };
        const speed = vlen(omega);
        // One gravity, held still, is a tilt. A shove is heavier than that,
        // so it must not become the new pose.
        const poseLike = measuredMag > 0.9 && measuredMag < 1.08;
        if (poseLike && speed < REST_RATE) {
            const same = this.poseDir != null && vdot(measuredHat, this.poseDir) > 0.98;
            if (same) this.poseMs += (dtOk ? dt : 0.016) * 1000;
            else {
                this.poseDir = measuredHat;
                this.poseMs = (dtOk ? dt : 0.016) * 1000;
            }
        } else {
            this.poseMs = 0;
            this.poseDir = null;
        }
        // A shove and a new tilt look the same at first. Once that reading
        // has been held still, it is the pose.
        if (this.poseMs > 200) {
            this.gravity = measuredHat;
            this.drive = null;
            this.driveMag = 0;
            this.driveIsHoriz = false;
            this.verticalMs = 0;
            this.horizHoldMs = 0;
            this.horizHold = null;
            this.prevHoriz = null;
            this.oppositeMs = 0;
            this.pendingShaft = null;
            this.pendingHoriz = null;
            this.shaftContinuing = false;
        }
        // A shove with a still wrist is still a swing. Gravity must not
        // swallow it just because the gyro is quiet.
        const shove = vlen({
            x: measured.x - this.gravity.x,
            y: measured.y - this.gravity.y,
            z: measured.z - this.gravity.z
        });
        const resting = near1g && speed < REST_RATE && (shove < 0.35 || this.poseMs > 200);

        if (resting && !gyroMissing) {
            const learn = 0.06;
            this.bias = vadd(vscale(this.bias, 1 - learn), vscale(raw, learn));
        }

        if (!dtOk && near1g) {
            // First sample, or a gap long enough that the in-between motion
            // was missed. A reading still near 1g is the pose, not a swing.
            this.gravity = measuredHat;
        } else if (dtOk) {
            // Gravity in the phone frame turns opposite the gyro.
            // The phone's own accelerometer stays near 1G through a wrist
            // swing, so it keeps the tilt. Only a hard shove of the whole
            // phone is ignored.
            const rotated = vadd(this.gravity, vscale(vcross(omega, this.gravity), -dt));
            const accelTrust = !near1g ? 0.02 : resting ? 0.5 : 0.015;
            const anchor = near1g ? measuredHat : rotated;
            this.gravity = vnorm(vadd(vscale(rotated, 1 - accelTrust), vscale(anchor, accelTrust)));
        }

        // The accelerometer is where a remote's accelerometer sits, so it
        // already has the swing. The tip estimate is the direction the wrist
        // is turning. It fills in a spin that the sensor barely feels, and
        // it keeps a stop from choosing the opposite shot.
        const felt = linearAccel(measured, this.gravity);
        const tip = speed >= SWING_RATE ? swingAccel(omega) : { x: 0, y: 0, z: 0 };
        let sensed = vlen(felt) >= LINEAR_DEAD_G ? felt : tip;
        // A reading that is still one gravity is the phone being tilted.
        // The tilt estimate lags, and that gap is not a shove. A fast spin
        // still moves the tip, so that part stays. A real swing moves the
        // magnitude off 1g.
        if (measuredMag > 0.9 && measuredMag < 1.08) {
            sensed = speed >= SWING_RATE ? tip : { x: 0, y: 0, z: 0 };
        }
        // Acceleration reverses when a swing stops, and it also reverses
        // between the wind-up and the hit. The wrist's spin does not: it
        // keeps the swing's direction until the wrist actually turns around.
        // When the shove is the opposite spike, the wrist's direction wins.
        // When the shove agrees, it keeps its own shape, so a lift stays on
        // a sideways swing. A strong shove on another axis stays there too.
        const tipAcrossMag = Math.hypot(tip.x, tip.z);
        const gyroSteers = tipAcrossMag >= 0.25;
        if (gyroSteers) {
            const dir = vnorm({ x: tip.x, y: 0, z: tip.z });
            const feltAcross = { x: felt.x, y: 0, z: felt.z };
            const feltMag = vlen(feltAcross);
            const agree = feltMag > 0.2 ? vdot(feltAcross, dir) / feltMag : 1;
            if (feltMag < 0.55 || agree < -0.5) {
                const mag = Math.max(tipAcrossMag, feltMag < 0.55 && agree > 0.5 ? feltMag : 0);
                sensed = { x: dir.x * mag, y: felt.y, z: dir.z * mag };
            } else if (agree > 0.5) {
                // The shove agrees with the wrist, and it may not be on just
                // one axis. Snapping it onto the wrist would drop the lift
                // off a sideways swing, or the side off a pitch.
                sensed = { x: felt.x, y: felt.y, z: felt.z };
            } else {
                const alongTip = vdot(feltAcross, dir);
                sensed = {
                    x: feltAcross.x - dir.x * alongTip + dir.x * tipAcrossMag,
                    y: felt.y,
                    z: feltAcross.z - dir.z * alongTip + dir.z * tipAcrossMag
                };
            }
        }
        const sensedMag = vlen(sensed);
        const stepMs = (dtOk ? dt : 0.016) * 1000;
        // The handle is the length of the phone. Side to side and a pitch
        // of the face are across it. Up and down the remote are along it.
        // Gravity is only the pose, so a pitch does not slide onto the
        // handle just because the phone is tilting.
        const alongHandle = sensed.y;
        const across = { x: sensed.x, y: 0, z: sensed.z };
        const acrossMag = vlen(across);
        const driveHoriz = this.driveIsHoriz;
        if (acrossMag >= 0.32) {
            const held = vnorm(across);
            if (this.horizHold && vdot(held, this.horizHold) > 0.5) this.horizHoldMs += stepMs;
            else {
                this.horizHold = held;
                this.horizHoldMs = stepMs;
            }
        } else {
            this.horizHoldMs = Math.max(0, this.horizHoldMs - stepMs);
        }
        const sideSwing = acrossMag >= 0.55 || (
            acrossMag >= 0.32 &&
            this.horizHoldMs >= 40 &&
            (Math.abs(alongHandle) < 0.55 || acrossMag >= Math.abs(alongHandle) * 0.3)
        );
        if (sensedMag >= LINEAR_DEAD_G) {
            // Across the handle can show up on its own. A pull along the
            // handle is in both directions, so it becomes an up or down
            // swing only when it is the whole gesture.
            if (sideSwing) {
                if (this.shaftContinuing && this.drive && !driveHoriz) {
                    // An up or down swing is still going. The sideways lean
                    // in its stop is not a new side swing.
                    this.verticalMs = 0;
                    sensed = { x: 0, y: 0, z: 0 };
                } else {
                this.pendingShaft = null;
                const hHat = vnorm(across);
                this.verticalMs = 0;
                const prevAcross = this.prevHoriz;
                const stepAlign = prevAcross ? vdot(hHat, prevAcross) : 1;
                this.prevHoriz = hHat;
                // A sudden flip is the swing stopping. A smooth turn is the
                // same shot continuing as the phone rotates.
                const opposes = !!this.drive && driveHoriz && vdot(hHat, this.drive) < 0;
                const suddenFlip = opposes && prevAcross != null && (stepAlign < 0.5 || this.oppositeMs > 0);
                // The wrist turned around in the first instant of a swing.
                // That is the hit replacing a wind-up. Once the shot has
                // carried on, a harder opposite reading is the stop.
                const turnedAround = opposes && gyroSteers
                    && nowMs - this.driveAt < 32
                    && acrossMag > this.driveMag + 0.15
                    && this.oppositeMs === 0;
                const samePending = this.pendingHoriz != null && vdot(hHat, this.pendingHoriz.hat) > 0.5;
                const pendingSeen = samePending && this.pendingHoriz ? this.pendingHoriz.seen + 1 : 1;
                const pendingMag = samePending && this.pendingHoriz ? Math.max(acrossMag, this.pendingHoriz.mag) : acrossMag;
                // A hard swing is the shot immediately. A light pull is held
                // until it keeps going, so the harder hit can replace it.
                const horizReady = !!this.drive || pendingMag >= 1.35 || pendingSeen >= 4 || turnedAround;
                const harderHit = opposes && !!this.drive && this.driveMag < 1.05 && acrossMag >= 1.35 && nowMs - this.driveAt < 32;
                if ((!this.drive || !driveHoriz) && !horizReady) {
                    this.pendingHoriz = { hat: hHat, mag: pendingMag, seen: pendingSeen };
                    sensed = { x: 0, y: 0, z: 0 };
                } else if (!this.drive || !driveHoriz || (opposes && prevAcross == null) || turnedAround || harderHit) {
                    // No swing yet, or the last one already went quiet. This
                    // sample is its own shot, including the opposite direction.
                    this.pendingHoriz = null;
                    this.drive = hHat;
                    this.driveMag = acrossMag;
                    this.driveAt = nowMs;
                    this.driveIsHoriz = true;
                    this.shaftContinuing = false;
                    this.oppositeMs = 0;
                } else if (suddenFlip) {
                    // The stop is the swing slowing down. It is not the other
                    // shot. A new direction starts only after this one goes quiet.
                    this.oppositeMs += stepMs;
                    sensed = { x: 0, y: 0, z: 0 };
                } else if (vdot(hHat, this.drive) >= 0) {
                    this.oppositeMs = 0;
                    // The hardest part of this swing is the shot. The first
                    // sample is often a lean, and it must not keep the lift
                    // or the side after the real hit has arrived.
                    if (acrossMag > this.driveMag) {
                        this.driveMag = acrossMag;
                        if (vdot(hHat, this.drive) > 0.5) this.drive = hHat;
                    }
                } else if (acrossMag > this.driveMag) {
                    this.driveMag = acrossMag;
                }
                if (this.drive && !(suddenFlip && this.oppositeMs > 0)) {
                    const strength = Math.max(acrossMag, Math.min(this.driveMag, MAX_TIP_G));
                    sensed = sideAndAgainst(this.drive, strength, alongHandle);
                }
                }
            } else if (this.drive && driveHoriz && this.prevHoriz != null) {
                // The handle pull arrived after the swing. Keep the direction,
                // unless the other way has already started. A pull frame must
                // not wipe that or punch the old shot back in.
                this.verticalMs = 0;
                if (this.oppositeMs > 0) {
                    this.oppositeMs = Math.max(0, this.oppositeMs - stepMs * 0.5);
                    sensed = { x: 0, y: 0, z: 0 };
                } else {
                    // The sideways part has dropped out. What is left along
                    // the handle, toward the hand, is the shared pull, not
                    // an upward shot. A shove toward the tip can still add on.
                    sensed = sideAndAgainst(this.drive, Math.max(this.driveMag, 0.55), Math.max(alongHandle, 0));
                }
            } else if (Math.abs(alongHandle) >= 0.55) {
                this.pendingHoriz = null;
                if (this.drive && this.driveIsHoriz) {
                    this.drive = null;
                    this.driveMag = 0;
                    this.driveIsHoriz = false;
                }
                this.verticalMs += stepMs;
                // Past a short pull toward the hand, but soon enough that a
                // quick flick up or down still counts.
                if (this.verticalMs > 48) {
                    // A little sideways lean is not part of this swing.
                    // Up and down stay on the handle.
                    const vHat = { x: 0, y: alongHandle >= 0 ? 1 : -1, z: 0 };
                    if (!this.drive) {
                        const sign = vHat.y;
                        if (!this.pendingShaft || this.pendingShaft.y !== sign) {
                            this.pendingShaft = { y: sign, mag: sensedMag, seen: 1 };
                            sensed = { x: 0, y: 0, z: 0 };
                        } else {
                            const mag = Math.max(sensedMag, this.pendingShaft.mag);
                            const seen = this.pendingShaft.seen + 1;
                            // A hard swing is sent as soon as it repeats.
                            // A light pull is held one sample longer, so a
                            // harder motion the other way can replace it
                            // before the light one is sent.
                            if (mag < 1.35 && seen < 3) {
                                this.pendingShaft = { y: sign, mag, seen };
                                sensed = { x: 0, y: 0, z: 0 };
                            } else {
                                this.drive = vHat;
                                this.driveMag = mag;
                                this.driveAt = nowMs;
                                this.driveIsHoriz = false;
                                this.shaftContinuing = true;
                                this.pendingShaft = null;
                            }
                        }
                    } else if (vdot(vHat, this.drive) < 0 && !this.shaftContinuing) {
                        this.drive = vHat;
                        this.driveMag = sensedMag;
                        this.driveAt = nowMs;
                        this.driveIsHoriz = false;
                        this.shaftContinuing = true;
                        this.oppositeMs = 0;
                        this.pendingShaft = null;
                    } else if (vdot(vHat, this.drive) < 0 && this.driveMag < 1.35 && sensedMag > this.driveMag + 0.25 && nowMs - this.driveAt < 32) {
                        // The first pull only crossed the line. A harder
                        // motion the other way, right then, is the hit.
                        // Once the swing has carried on, slowing down is the stop.
                        this.drive = vHat;
                        this.driveMag = sensedMag;
                        this.driveAt = nowMs;
                        this.driveIsHoriz = false;
                        this.shaftContinuing = true;
                        this.oppositeMs = 0;
                        this.pendingShaft = null;
                    } else if (vdot(vHat, this.drive) < 0) {
                        // Same as a sideways stop: slowing down is not the
                        // opposite swing.
                        this.oppositeMs += stepMs;
                        sensed = { x: 0, y: 0, z: 0 };
                    } else if (sensedMag > this.driveMag) {
                        this.drive = vHat;
                        this.driveMag = sensedMag;
                        this.driveIsHoriz = false;
                        this.shaftContinuing = true;
                        this.oppositeMs = 0;
                    }
                    if (this.drive && vdot(sensed, this.drive) > 0) {
                        sensed = vscale(this.drive, swingTarget(Math.max(sensedMag, this.driveMag)));
                    }
                } else {
                    sensed = { x: 0, y: 0, z: 0 };
                }
            }
            this.quietMs = 0;
        } else if (this.pendingHoriz) {
            const pending = this.pendingHoriz;
            this.pendingHoriz = null;
            this.drive = pending.hat;
            this.driveMag = pending.mag;
            this.driveAt = nowMs;
            this.driveIsHoriz = true;
            this.shaftContinuing = false;
            this.quietMs = 0;
            sensed = sideAndAgainst(pending.hat, Math.max(pending.mag, 0.55), 0);
        } else if (this.pendingShaft) {
            const pending = this.pendingShaft;
            this.pendingShaft = null;
            this.drive = { x: 0, y: pending.y, z: 0 };
            this.driveMag = pending.mag;
            this.driveAt = nowMs;
            this.driveIsHoriz = false;
            this.shaftContinuing = true;
            this.quietMs = 0;
            sensed = vscale(this.drive, swingTarget(Math.max(pending.mag, 0.55)));
        } else if (speed < SWING_RATE) {
            this.quietMs += stepMs;
            this.oppositeMs = 0;
            this.verticalMs = 0;
            this.horizHoldMs = 0;
            this.horizHold = null;
            // One quiet sample is a gap in the swing, not a new shot.
            // A real pause is what lets the next swing be its own direction.
            if (this.quietMs > 32) {
                this.prevHoriz = null;
                this.shaftContinuing = false;
            }
            if (this.quietMs > 100) {
                this.drive = null;
                this.driveMag = 0;
                this.driveIsHoriz = false;
            }
        } else {
            // A short gap while the wrist is still turning is not a new gesture.
            // A long quiet means the shot is over, so the held pose is not that shot.
            this.quietMs += stepMs;
            this.oppositeMs = Math.max(0, this.oppositeMs - stepMs * 0.5);
            if (this.quietMs > 160) {
                this.drive = null;
                this.driveMag = 0;
                this.driveIsHoriz = false;
                this.pendingHoriz = null;
                this.verticalMs = 0;
                this.horizHoldMs = 0;
                this.horizHold = null;
                this.prevHoriz = null;
            }
        }
        const followLinear = resting ? 0.7 : 0.85;
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

        const result = {
            accel: poseClear(this.gravity, this.linear),
            gyro
        };
        this.last = result;
        return result;
    }
}
