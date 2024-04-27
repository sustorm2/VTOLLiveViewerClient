import { Color } from "strik-2d-renderer";
import * as THREE from "three";

import { EnableRPCs, RPC } from "../../../../VTOLLiveViewerCommon/dist/src/rpc.js";
import { Vector3 } from "../../../../VTOLLiveViewerCommon/dist/src/shared";
import { Vector } from "../../../../VTOLLiveViewerCommon/dist/src/vector";
import { addCommas, Application, deg, msToKnots, mToFt, rad } from "../app";
import { DesignatorLine } from "../entityBase/designatorLine";
import { Entity, MAX_OBJECT_SIZE } from "../entityBase/entity";
import { JesterCallouts } from "../jester/jesterCallouts";
import { Settings } from "../settings";

function mark(size: number, color: number) {
	const markerGeom = new THREE.SphereGeometry(size, 8, 8);
	const markerMat = new THREE.MeshBasicMaterial({ color: color, wireframe: true, side: THREE.DoubleSide });
	const markerMesh = new THREE.Mesh(markerGeom, markerMat);
	markerMesh.name = "marker";

	return markerMesh;
}

const predictedPoints = 500;
const predictedStep = 0.05;

@EnableRPCs("instance", ["F45A", "FA26B", "AV42", "AH94", "T55", "EF24", "Aircraft"]) // "Aircraft" is NukOpt
class PlayerVehicle extends Entity {
	private tgp: DesignatorLine;
	public lockLine: DesignatorLine;
	private throttle: number;
	private pyr: Vector = new Vector(0, 0, 0);

	private playerHeadLine: THREE.Line;
	private playerHeadLineGeom: THREE.BufferGeometry; // calculateScale

	private predictedPathLine: THREE.Line;
	private predictedPathLineGeom: THREE.BufferGeometry;
	private accelLines: THREE.Line[] = [];

	private jester: JesterCallouts;
	private previousRotation: Vector;
	private previousUpdateTime = 0;
	private updateTimeDelta = 0;

	// private carrierApproachTestSphere: THREE.Mesh;
	// private carrierApproachTestSphere2: THREE.Mesh;
	// private carrierRelativePosSphere: THREE.Mesh;

	// private velocityMarker: THREE.Mesh;
	// private headingMarker: THREE.Mesh;

	public set scale(scale: number) {
		const maxSetScale = MAX_OBJECT_SIZE / this.baseScaleSize;

		this._scale = Math.min(maxSetScale, Math.max(scale * this.scaleDamper, 1) * this.iMeshLoadScale);
		this.onScaleUpdate();
	}

	public get scale() {
		return this._scale;
	}

	public static spawnFor: string[] = [
		"Vehicles/SEVTF",
		"Vehicles/FA-26B",
		"Vehicles/AH-94",
		"Vehicles/VTOL4",
		"Vehicles/T-55",
		"Vehicles/EF-24",
		"NuclearOption/Fighter1",
		"NuclearOption/AttackHelo1",
		"NuclearOption/COIN",
		"NuclearOption/Darkreach"
	];

	constructor(app: Application) {
		super(app, { hasTrail: true, showInSidebar: true, showInBra: true });
		this.tgp = new DesignatorLine(this, app, "#00ff00");
		this.throttle = 1;

		// const pMat = new THREE.LineBasicMaterial({ color: "#ffff00" });
		// this.predictedPathLineGeom = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, 1000)]);
		// this.predictedPathLine = new THREE.Line(this.predictedPathLineGeom, pMat);
		// this.predictedPathLine.frustumCulled = false;
		// this.predictedPathLine.name = "predictedPathLine";
		// // this.meshProxyObject.add(this.predictedPathLine);
		// this.scene.add(this.predictedPathLine);
	}

	public async spawn(id: number, ownerId: string, path: string, position: Vector, rotation: Vector, isActive: boolean): Promise<void> {
		super.spawn(id, ownerId, path, position, rotation, isActive);
		await this.setActive(`Player vehicle spawned`);
		this.showInSidebar = true;
		this.textOverlay.combineId = null;

		this.tgp.init();
		this.lockLine = new DesignatorLine(this, this.app, "#d66f15");
		this.lockLine.init();

		Settings.instance.on("Pilot Look Indicator", (lookSetting: string) => {
			if (this.playerHeadLine) this.playerHeadLine.visible = lookSetting == "On";
		});

		if (ownerId == "76561198162340088") this.jester = new JesterCallouts(this);

		// this.velocityMarker = mark(1, 0x00ff00);
		// this.headingMarker = mark(1, 0x0000ff);
		// this.app.sceneManager.add(this.velocityMarker, this.headingMarker);

		// this.carrierApproachTestSphere = mark(1, 0xff0000);
		// this.carrierApproachTestSphere2 = mark(1, 0x0000ff);
		// this.carrierRelativePosSphere = mark(1, 0x00ff00);
		// this.app.sceneManager.add(this.carrierApproachTestSphere, this.carrierRelativePosSphere, this.carrierApproachTestSphere2);
	}

	private addPlayerHeadLine() {
		if (this.playerHeadLine) return;
		const headMat = new THREE.LineBasicMaterial({ color: "#1a15b0" });
		this.playerHeadLineGeom = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, 1000)]);

		this.playerHeadLine = new THREE.Line(this.playerHeadLineGeom, headMat);
		this.playerHeadLine.frustumCulled = false;
		this.playerHeadLine.visible = Settings.get("Pilot Look Indicator") == "On";
		this.meshProxyObject.add(this.playerHeadLine);
	}

	protected override onScaleUpdate(): void {
		super.onScaleUpdate();
		// Keep head the same size by scaling with the inverse of the scale
		if (this.playerHeadLine) this.playerHeadLine.scale.set(1 / this.scale, 1 / this.scale, 1 / this.scale);
	}

	private renderControlInputs() {
		// this.pyr.set(0.5, -0.25, 0.75);
		// this.throttle = 0.6;

		const r = this.app.controlInputsRenderer;
		r.clear(0);
		const size = r.ctx.canvas.width;
		r.ctx.canvas.style.top = `-${size + 5}px`;

		const throttleWidth = 15;
		const rollPitchSize = 4;
		const c = new Color([0, 255, 0]);

		// Outer box
		r.line(1, 1, size - 1, 1, c);
		r.line(1, 1, 1, size - 1, c);
		r.line(size - 1, 1, size - 1, size - 1, c);
		r.line(1, size - 1, size - 1, size - 1, c);

		// Throttle
		r.line(throttleWidth, 1, throttleWidth, size - 1, c);
		r.line(throttleWidth, throttleWidth, size - 1, throttleWidth, c);
		const throttleHeight = size * this.throttle;
		r.rect(1, size - throttleHeight, throttleWidth, throttleHeight, c);

		// Yaw line
		const horizontalSize = size - throttleWidth;
		const yawLineX = horizontalSize / 2 + (horizontalSize / 2) * this.pyr.y + throttleWidth;
		r.ctx.lineWidth = 2;
		r.line(yawLineX, throttleWidth, yawLineX, size - 1, c);
		r.ctx.lineWidth = 1;

		// Pitch/Roll circle
		const x = horizontalSize / 2 + (horizontalSize / 2) * -this.pyr.z + throttleWidth;
		const y = horizontalSize / 2 + (horizontalSize / 2) * -this.pyr.x + throttleWidth;

		r.ellipse(x, y, rollPitchSize, c);

		// Quadrant bars
		r.line(horizontalSize / 2 + throttleWidth, throttleWidth, horizontalSize / 2 + throttleWidth, size - 1, c);
		r.line(throttleWidth, horizontalSize / 2 + throttleWidth, size - 1, horizontalSize / 2 + throttleWidth, c);
	}

	public update(dt: number): void {
		super.update(dt);

		if (this.tgp) this.tgp.update();
		if (this.lockLine) this.lockLine.update();

		// Sometimes player's don't get a team until after the spawn, lets check for that
		if (this.hasFoundValidOwner && this.team != this.owner.team) {
			console.warn(`Entity ${this.debugName} has team ${this.team} but owner ${this.owner.pilotName} has team ${this.owner.team}`);
			this.setTeam(this.owner.team);
		}

		if (this.isFocus) this.renderControlInputs();

		// this.jester?.update();

		// // if (this.velocity.length() == 0) return;
		// const points: THREE.Vector3[] = [];
		// const pos = this.position.to<THREE.Vector3>(THREE.Vector3);
		// const vel = this.velocity.to<THREE.Vector3>(THREE.Vector3);
		// const accel = this.acceleration.to<THREE.Vector3>(THREE.Vector3);
		// const rotationDelta = this.rotation.clone().subtract(this.previousRotation);
		// // .multiply(1000 / this.updateTimeDelta);
		// const rotDeltaQuat = new THREE.Quaternion().setFromEuler(new THREE.Euler(rotationDelta.x, rotationDelta.y, rotationDelta.z));

		// for (let i = 0; i < predictedPoints; i++) {
		// 	accel.applyQuaternion(rotDeltaQuat);

		// 	const stepAccel = accel.clone().multiplyScalar(predictedStep);
		// 	vel.add(stepAccel);
		// 	const stepVel = vel.clone().multiplyScalar(predictedStep);
		// 	pos.add(stepVel);

		// 	points.push(new THREE.Vector3(pos.x, pos.y, pos.z));

		// 	if (this.accelLines[i]) {
		// 		const vec = pos.clone().add(accel.clone().multiplyScalar(100));
		// 		this.accelLines[i].geometry.setFromPoints([pos, vec]);
		// 	} else {
		// 		const aMat = new THREE.LineBasicMaterial({ color: "#ff0000" });
		// 		const aGeom = new THREE.BufferGeometry().setFromPoints([pos, pos.clone().add(accel.clone().multiplyScalar(100))]);
		// 		this.accelLines[i] = new THREE.Line(aGeom, aMat);
		// 		this.accelLines[i].frustumCulled = false;
		// 		this.accelLines[i].name = "accelLine";
		// 		this.scene.add(this.accelLines[i]);
		// 	}
		// }

		// this.predictedPathLineGeom.setFromPoints(points);
		// this.predictedPathLine.geometry = new THREE.BufferGeometry().setFromPoints(points);
		// this.predictedPathLine.matrixWorldNeedsUpdate = true;

		// const carrier = this.app.entities.find(e => e.type.toLowerCase() == "units/allied/alliedcarrier");
		// if (!carrier) return;

		// const carrierRotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(carrier.rotation.x, carrier.rotation.y, carrier.rotation.z));
		// const carrierRotation2 = new THREE.Quaternion().setFromEuler(new THREE.Euler(carrier.rotation.x, carrier.rotation.y + rad(10), carrier.rotation.z));
		// const relativePos = this.position.clone().subtract(carrier.position);
		// const carrierForward = new THREE.Vector3(1, 0, 0).applyQuaternion(carrierRotation);
		// const carrierForward2 = new THREE.Vector3(1, 0, 0).applyQuaternion(carrierRotation2);
		// const onPlane = new THREE.Vector3(relativePos.x, relativePos.y, relativePos.z).projectOnPlane(carrierForward);
		// const onPlane2 = new THREE.Vector3(relativePos.x, relativePos.y, relativePos.z).projectOnPlane(carrierForward2);

		// const cx = carrier.position.x;
		// const cy = carrier.position.y;
		// const cz = carrier.position.z;
		// const cfO = carrierForward2.normalize().multiplyScalar(20);
		// this.carrierRelativePosSphere.position.set(cx + relativePos.x, cy + relativePos.y, cz + relativePos.z);
		// this.carrierApproachTestSphere2.position.set(cx + onPlane2.x + cfO.x, cy + onPlane2.y + cfO.y, cz + onPlane2.z + cfO.z);
		// this.carrierApproachTestSphere.position.set(cx + onPlane.x, cy + onPlane.y, cz + onPlane.z);

		if (this.textOverlay) {
			const textOptions = Settings.get("Player Labels");
			if (textOptions == "Off") this.textOverlay.hide();
			else this.textOverlay.show();

			const speed = addCommas(Math.floor(msToKnots(this.velocity.length())));
			let text = `${this.owner.pilotName} [${this.displayName}]`;
			if (textOptions == "All") text += `\n${Math.floor(mToFt(this.position.y))}ft\n${speed}kn`;
			this.textOverlay.edit(text);
		}
	}

	private getAoa() {
		const dist = 100;
		// const velMarkerPos = this.position.add(this.velocity.clone().unit().multiply(dist));

		const positionRef = new THREE.Object3D();
		positionRef.position.set(this.position.x, this.position.y, this.position.z);

		const rotationRef = new THREE.Object3D();
		rotationRef.rotation.set(this.rotation.x, this.rotation.y, this.rotation.z);
		positionRef.add(rotationRef);

		const offsetRef = new THREE.Object3D();
		offsetRef.position.set(0, 0, dist);
		rotationRef.add(offsetRef);

		const headingMarkerPos = new THREE.Vector3();
		offsetRef.getWorldPosition(headingMarkerPos);

		// this.velocityMarker.position.set(velMarkerPos.x, velMarkerPos.y, velMarkerPos.z);
		// this.headingMarker.position.copy(headingMarkerPos);

		const velAspect = this.velocity.clone().unit();
		const headingAspect = headingMarkerPos.clone().sub(new THREE.Vector3(this.position.x, this.position.y, this.position.z)).normalize();
		const aoaOffset = this.type == "Vehicles/FA-26B" ? 0.806 : 0; // 26b has weird aoa offset
		const aoa = deg(velAspect.angleTo(Vector.from(headingAspect))) + aoaOffset;

		return aoa;
	}

	public async remove(reason: string): Promise<void> {
		await super.remove(reason);
		if (this.tgp) this.tgp.remove();
		if (this.lockLine) this.lockLine.remove();
		const ownedEntities = this.app.getEntitiesByOwnerId(this.ownerId);
		ownedEntities.forEach(e => (e.canShowAsEquip = false));
	}

	public getLockingMe() {
		return this.app.entities.filter(e => {
			if (!(e instanceof PlayerVehicle)) return false;
			return e.lockLine?.isLockedTo(this);
		});
	}

	@RPC("in")
	UpdateData(pos: Vector3, vel: Vector3, accel: Vector3, rot: Vector3, throttle: number, isLanded: boolean, pyr: Vector) {
		this.throttle = throttle;
		this.pyr.set(pyr);
		// if (Application.time != this.previousUpdateTime) {
		// 	this.previousRotation = this.rotation.clone();
		// 	this.updateTimeDelta = Application.time - this.previousUpdateTime;
		// 	this.previousUpdateTime = Application.time;
		// }
		this.updateMotion(pos, vel, accel, rot);

		// const quat = new THREE.Quaternion().setFromEuler(new THREE.Euler(rad(rot.x), -rad(rot.y), -rad(rot.z), "YXZ"));
		// const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(quat);
		// const aoa = this.velocity.angleTo(Vector.from(forward));
		// let aoaOffset = 0;
		// if (this.type == "Vehicles/FA-26B" || this.type == "Vehicles/T-55") aoaOffset = 0.806;
		// console.log(`Aoa: ${deg(aoa) + aoaOffset}`);
	}

	@RPC("in")
	UpdateOwnerId(ownerId: string) {
		this.ownerId = ownerId;
	}

	@RPC("in")
	UpdateTGP(direction: Vector3, lockedWorldPoint: Vector3, lockedActor: number) {
		if (lockedWorldPoint && lockedWorldPoint.x != 0) this.tgp.lockPoint(new Vector(-lockedWorldPoint.x, lockedWorldPoint.y, lockedWorldPoint.z));
		if (lockedActor != -1) this.tgp.lockUnit(lockedActor);
	}

	@RPC("in")
	UpdatePilotHead(direction: Vector3) {
		if (!this.playerHeadLine) this.addPlayerHeadLine();
		this.playerHeadLine?.rotation.set(rad(direction.x), -rad(direction.y), rad(direction.z));
	}

	@RPC("in")
	FireCMS() {
		this.app.flareManager.fireCm(this);
	}

	@RPC("in")
	SetLock(actorId: number, isLocked: boolean) {
		if (!this.lockLine) return;
		// console.log(`${this} SetLock ${actorId} ${isLocked}`);
		const actor = this.app.getEntityByUnitId(actorId);
		if (!actor) return; //console.error(`Unable to find ActorId ${actorId} for SetLock ${isLocked}`);

		if (isLocked) {
			this.lockLine.lockEntity(actor);
		} else {
			this.lockLine.hide();
		}
	}

	@RPC("in")
	Damage() {
		this.triggerDamage();
	}

	@RPC("in")
	Die() {
		this.triggerDeath();
	}

	@RPC("in")
	SetFuel(tank: number, fuel: number) {
		if (tank == 0 && this.equipManager) this.equipManager.fuel = fuel;
	}
}

export { PlayerVehicle };
