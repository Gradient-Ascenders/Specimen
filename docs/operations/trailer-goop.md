# Goop's trailer introduction

Open `?trailer=goop`, for example `http://localhost:5173/?trailer=goop`.
The opening's preparation screen also links to this second shot and back again.
This is an independent capture-only scene; it does not change any playable level.

Press **Play Goop introduction** once both shared character models and the visual
effects are prepared. Recording controls disappear. **Space** pauses/resumes,
**R** replays and **H** shows/hides the controls and timeline slider, just as in
Bob's opening. Switching tabs pauses playback.

The 11.8-second sequence takes place in a laboratory service bay:

- A low tracking camera follows Bob moving forward. He looks up and the camera
  cranes upward to reveal the flying security drone, which fires at him. The
  entire drone stays above the opening frame so its appearance is a surprise.
- A hard reverse cut faces Bob. Goop rushes in from outside the frame, bumps Bob
  clear of the firing line and takes the shot on his actual gel surface.
- Staying in the reverse shot, Goop lands, winds up and fires green acid back.
- The camera cuts to the drone before the acid arrives, catches the hit and
  follows the wreck down. The drone's actual casing, barrels, lens and fan
  assemblies detach and settle on the floor with sparks and smoke. The housing,
  two separate barrels and four fans fall under gravity, bounce, slide and tip
  onto stable faces with friction. Their floor contacts follow the real mesh
  silhouette, so thin parts do not hover on oversized collision boxes.
- The shot holds on Goop and Bob for the next edit.

The shot reuses the game's authored Bob/Goop models, shared character materials,
security-drone head and containment art resources. Poses, projectiles, debris and
camera movement are sampled from absolute time so seeking and replay reset the
same scene without leftover attacks. Wreck motion is baked at a fixed 120 Hz
before playback, keeping collisions independent of capture frame rate and
avoiding per-frame simulation work. All later-visible effects are prepared
before playback. This is a visual shot; audio recording/encoding is not added.
