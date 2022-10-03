import * as THREE from "three";

import { Application } from "../app";
import { Entity } from "./entity";

const MAX_LINE_TRAIL_LEN = 256 * 4;
const TRAIL_RATE = 1000 / 5;

// TODO: This still gets expensive over time. Need to do chunking, possibly just an "active" and "inactive" chunk
class SimpleUnitTrail {
	private lineMesh: THREE.Line;
	private lineGeom: THREE.BufferGeometry;
	private linePoints: THREE.Vector3[] = [];

	private hasInit = false;

	public color = {
		r: 0,
		g: 100,
		b: 255
	};
	private lastTrailTime = 0;

	constructor(private entity: Entity) {
		Application.instance.onTimeFlip((dir) => {
			if (!this.hasInit) return;
			if (dir < 0) this.retractTrail();
			else this.extendTrail();
		});
	}

	public updateColor(color: { r: number; g: number; b: number; }): void {
		this.color = color;
		if (this.hasInit) {
			const mat = this.lineMesh.material as THREE.LineBasicMaterial;
			mat.color.set(new THREE.Color(this.color.r, this.color.g, this.color.b));
		}
	}

	public init(): void {
		const lineMat = new THREE.LineBasicMaterial({ color: new THREE.Color(this.color.r, this.color.g, this.color.b) });
		this.lineGeom = new THREE.BufferGeometry();
		this.lineMesh = new THREE.Line(this.lineGeom, lineMat);
		this.lineMesh.frustumCulled = false;
		this.lineMesh.name = "Simple unit trail line";
		this.entity.scene.add(this.lineMesh);
		this.lastTrailTime = Application.time;
		this.hasInit = true;
	}

	private extendTrail() {
		this.linePoints.push(new THREE.Vector3(this.entity.position.x, this.entity.position.y, this.entity.position.z));
		this.lineGeom.setFromPoints(this.linePoints);
		this.lastTrailTime = Application.time;
	}

	private retractTrail() {
		this.linePoints.pop();
		this.lineGeom.setFromPoints(this.linePoints);
		this.lastTrailTime = Application.time;
	}

	public run(): void {
		if (!this.hasInit) return;

		if (Application.time - this.lastTrailTime > TRAIL_RATE) this.extendTrail();
		if (Application.time - this.lastTrailTime < -TRAIL_RATE) this.retractTrail(); // Handle replay rewind

		this.linePoints[this.linePoints.length - 1]?.set(this.entity.position.x, this.entity.position.y, this.entity.position.z);

		if (this.lineGeom.attributes["position"] && this.linePoints.length > 2) {
			const pos = this.lineGeom.attributes["position"].array as Float32Array;
			pos[pos.length - 3] = this.entity.position.x;
			pos[pos.length - 2] = this.entity.position.y;
			pos[pos.length - 1] = this.entity.position.z;

			this.lineGeom.attributes["position"].needsUpdate = true;
		}

		if (this.linePoints.length > MAX_LINE_TRAIL_LEN) this.linePoints.shift();
	}

	public reset(): void {
		this.remove();
		this.init();
	}

	public remove(): void {
		this.linePoints = [];
		this.entity.scene.remove(this.lineMesh);
	}
}

export { SimpleUnitTrail };