"use client";

import { createContext, useContext, useEffect, useMemo, useRef, type ReactNode } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { usePointer } from "./PointerProvider";
import { SPHERE_DISTORTION } from "@/lib/sphereDistortion";

/**
 * Where the cursor currently touches one sphere. Written by the driver once per
 * frame and read by that sphere's own frame callback — a plain mutable object
 * rather than React state, because this changes every frame and nothing needs to
 * re-render when it does.
 */
export interface SphereContact {
  /** The cursor is on this sphere's surface, and this is the front-most hit. */
  active: boolean;
  /** World-space point on the surface under the cursor. Valid while `active`. */
  point: THREE.Vector3;
  /** Set for the single frame the cursor arrives / leaves. */
  entered: boolean;
  exited: boolean;
  /** The pointer is held down on this sphere. */
  pressed: boolean;
  /** A press started on this sphere this frame. */
  struck: boolean;
}

/** A sphere that wants to be touchable. */
export interface SphereTarget {
  /**
   * The displaced mesh. Its `matrixWorld` supplies both the world centre for the
   * ray test and the basis for mapping the hit back into local space, so the
   * contact survives the sphere rotating, floating and scrolling underneath it.
   */
  objectRef: React.RefObject<THREE.Object3D | null>;
  /** Undeformed radius, local units. */
  radius: number;
  contact: SphereContact;
  /** Last press this target has already been told about. */
  seenPressCount: number;
}

/** Module-level fallback so a sphere rendered without a provider is simply inert. */
const ORPHAN_REGISTRY = new Set<SphereTarget>();

const SphereRegistryContext = createContext<Set<SphereTarget>>(ORPHAN_REGISTRY);

export function SphereInteractionProvider({ children }: { children: ReactNode }) {
  const registry = useMemo(() => new Set<SphereTarget>(), []);
  return (
    <SphereRegistryContext.Provider value={registry}>{children}</SphereRegistryContext.Provider>
  );
}

/**
 * Registers a sphere with the interaction field and hands back the mutable slot
 * the driver writes its hit into.
 *
 * Takes the mesh *ref* rather than the instance so the target is complete the
 * moment it is built and never has to be patched up after render.
 */
export function useSphereTarget(
  radius: number,
  objectRef: React.RefObject<THREE.Object3D | null>
): SphereTarget {
  const registry = useContext(SphereRegistryContext);

  const target = useMemo<SphereTarget>(
    () => ({
      objectRef,
      radius,
      seenPressCount: 0,
      contact: {
        active: false,
        point: new THREE.Vector3(),
        entered: false,
        exited: false,
        pressed: false,
        struck: false,
      },
    }),
    [objectRef, radius]
  );

  useEffect(() => {
    registry.add(target);
    return () => {
      registry.delete(target);
    };
  }, [registry, target]);

  return target;
}

/**
 * Resolves the cursor against every registered sphere, once per frame.
 *
 * Deliberately *not* using the R3F event system. Attaching `onPointerMove` to the
 * spheres makes three.js raycast their real geometry — 25k+ triangles each, on
 * every mouse event — and it only fires when the mouse moves, so a stationary
 * cursor loses contact as the sphere floats and spins away underneath it. An
 * analytic ray/sphere test costs a handful of flops per sphere, runs on the frame
 * clock instead of the event queue, and yields an exact surface point.
 *
 * Must be mounted inside `<Canvas>`. Render it before the spheres so its frame
 * callback subscribes first and they read a contact computed this frame.
 */
export function SphereInteractionDriver({ enabled = true }: { enabled?: boolean }) {
  const registry = useContext(SphereRegistryContext);
  const pointer = usePointer();
  const camera = useThree((state) => state.camera);

  // All scratch, allocated once — this runs 60 times a second.
  const scratch = useMemo(
    () => ({
      raycaster: new THREE.Raycaster(),
      ndc: new THREE.Vector2(),
      probe: new THREE.Sphere(),
      centre: new THREE.Vector3(),
      candidate: new THREE.Vector3(),
      nearestPoint: new THREE.Vector3(),
    }),
    []
  );
  const lastPressCount = useRef(0);

  /* eslint-disable react-hooks/immutability -- The contact slots are a deliberate
     frame-loop store living outside React's model: rewritten every frame and read
     by the spheres' own frame callbacks. Routing them through state would
     re-render the whole scene 60 times a second. */
  useFrame(() => {
    const p = pointer.current;
    if (registry.size === 0) return;

    const { raycaster, ndc, probe, centre, candidate, nearestPoint } = scratch;

    let nearest: SphereTarget | null = null;
    let nearestDistSq = Infinity;

    if (enabled && p.inside) {
      ndc.set(p.x, p.y);
      // Rebuilt from the live camera every frame, which is what keeps the mapping
      // correct through camera moves, viewport resizes and projection changes.
      raycaster.setFromCamera(ndc, camera);
      const ray = raycaster.ray;

      for (const target of registry) {
        const object = target.objectRef.current;
        if (!object) continue;

        centre.setFromMatrixPosition(object.matrixWorld);
        probe.set(centre, target.radius * SPHERE_DISTORTION.hitPadding);

        if (!ray.intersectSphere(probe, candidate)) continue;

        // Front-most hit wins, so overlapping spheres can't both claim the cursor
        // and a sphere behind another is never touched through it.
        const distSq = ray.origin.distanceToSquared(candidate);
        if (distSq < nearestDistSq) {
          nearestDistSq = distSq;
          nearest = target;
          nearestPoint.copy(candidate);
        }
      }
    }

    const freshPress = p.pressCount !== lastPressCount.current;
    lastPressCount.current = p.pressCount;

    for (const target of registry) {
      const contact = target.contact;
      const was = contact.active;
      const now = target === nearest;

      contact.entered = now && !was;
      contact.exited = !now && was;
      contact.active = now;
      contact.pressed = now && p.down;
      contact.struck = now && freshPress && target.seenPressCount !== p.pressCount;

      if (contact.struck) target.seenPressCount = p.pressCount;
      if (now) contact.point.copy(nearestPoint);
    }
  });
  /* eslint-enable react-hooks/immutability */

  return null;
}
