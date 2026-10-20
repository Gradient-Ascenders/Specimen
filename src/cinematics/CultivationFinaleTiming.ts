/** Keep the authored action beats together while giving the opening reveal and
 * coordinated security response more screen time. Every consumer uses seconds
 * on this same clock (camera, actors, projectiles, sound and HUD). */
export function voltFinaleTime(authoredSeconds: number): number {
  if (authoredSeconds <= 2.8) return authoredSeconds;
  if (authoredSeconds <= 8.3) return 2.8 + (authoredSeconds - 2.8) * 2;
  if (authoredSeconds <= 10.5) return 13.8 + (authoredSeconds - 8.3) * (3.2 / 2.2);
  return authoredSeconds + 6.5;
}
