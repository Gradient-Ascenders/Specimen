import type { ResettablePuzzleComponent } from './PuzzleRegistry.ts';
import type { BlastDoorObstacle, VerticalBlastDoor } from './VerticalBlastDoor.ts';
import type { WallButton, WallButtonBody, WallButtonOccupant } from './WallButton.ts';

/** Room-agnostic wiring between one physical wall button and one blast door. */
export class WallButtonDoorCoordinator<Body extends WallButtonBody>
  implements ResettablePuzzleComponent
{
  private readonly button: WallButton<Body>;
  private readonly door: VerticalBlastDoor;
  private readonly occupants: readonly WallButtonOccupant<Body>[];
  private readonly obstacles: readonly BlastDoorObstacle[];
  private readonly unsubscribeButton: () => void;
  private enabledValue = false;
  private disposed = false;

  constructor(
    button: WallButton<Body>,
    door: VerticalBlastDoor,
    occupants: readonly WallButtonOccupant<Body>[],
  ) {
    this.button = button;
    this.door = door;
    this.occupants = occupants;
    this.obstacles = occupants.map(({ id, body }) => ({
      id,
      position: body.position,
      radiusMetres: body.radiusMetres,
    }));
    this.unsubscribeButton = this.button.events.on('changed', ({ pressed }) => {
      this.door.setOpen(this.enabledValue && pressed);
    });
  }

  get enabled(): boolean {
    return this.enabledValue;
  }

  setEnabled(enabled: boolean): void {
    if (this.disposed || this.enabledValue === enabled) return;
    this.enabledValue = enabled;
    this.button.setEnabled(enabled);
    if (!enabled) this.door.setOpen(false);
  }

  update(deltaSeconds: number): void {
    if (this.disposed) throw new Error('Cannot update a disposed wall-button coordinator.');
    this.button.update(this.occupants);
    this.door.setOpen(this.enabledValue && this.button.isPressed);
    this.door.update(deltaSeconds, this.obstacles);
  }

  reset(): void {
    if (this.disposed) return;
    this.setEnabled(false);
    this.door.setOpen(false);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.enabledValue = false;
    this.unsubscribeButton();
  }
}
