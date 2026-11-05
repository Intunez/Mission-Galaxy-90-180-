# Mission Galaxy 2.0

Separate playable version at `v2/`. The original root application is unchanged.

- Solo ruimtemissie replaces practice/time challenge: complete all twelve pairs, see completion time and best local personal time record.
- Initial scan: 20 seconds. Memory refresh: 5 seconds after 60 seconds of active play, at a safe turn boundary. Existing cards, found pairs, order and scores are preserved.
- Match review: 2 seconds. Rocket animation: 2.9 seconds. Falling animation: 2.6 seconds. The final rocket flight stays at 5.8 seconds and the arrival ceremony keeps its original timing. CSS timelines and generated audio cues run at the same faster pace.
- Team refresh is synchronized by the teacher's state projection; a fresh turn begins after each refresh. Pausing does not count toward the refresh interval.
- Music/video labels are removed. All animations remain visible to teams; outcome audio plays on the teacher only. Solo has sound and video.
- Uses separate module paths, browser storage keys, Firebase app name, and independently snapshotted assets. Existing Firebase Spark project and published security rules remain in use without modification. Match codes must be shared from the same version.

Run `npm test` for engine tests and `node scripts/sync-local-engine.cjs` after editing the engine.
