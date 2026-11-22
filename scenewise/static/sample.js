/* An original sample scene so the app has something to try on first launch. */
(function (root) {
  const SAMPLE = `The Understudy

SCENE 1. A dressing room, the night before opening.

(NELL sits at the mirror, script in hand. ROSS leans in the doorway.)

ROSS: You've been staring at page forty for an hour.

NELL: Page forty is staring back.

ROSS: Then give it to me. I'll read Margaret, you read the lines you keep dropping.

NELL: I don't keep dropping them. They keep leaving.

ROSS: (taking the script) Top of the speech. "I came back for the piano."

NELL: I came back for the piano. Not for the house, not for the garden, and certainly not for you.

ROSS: Good. Keep going.

NELL: I came back because it was the only thing in this town that ever listened to me.

ROSS: And?

NELL: And... that's where it goes. Every time. Right there.

ROSS: "And it still knows the tune."

NELL: And it still knows the tune. Why can't I hold on to six words?

ROSS: Because you're thinking about tomorrow instead of the piano.

NELL: Tomorrow has four hundred people in it.

ROSS: Tomorrow has one piano in it. Same as tonight.

(A knock. KIT, the stage manager, puts her head round the door.)

KIT: Fifteen minutes to lock-up. Anyone still here gets locked in with the props.

ROSS: Five more minutes.

KIT: That's what you said at ten. (She goes.)

NELL: Again. From the top.

ROSS: From the top. "I came back for the piano."

NELL: I came back for the piano. And it still knows the tune.

ROSS: You skipped the middle.

NELL: I skipped to the part I know. That's progress.

BOTH: (laughing) From the top.

SCENE 2. Opening night. The wings, two minutes to curtain.

(NELL paces. ROSS, in costume, adjusts his collar.)

ROSS: How's the piano?

NELL: Still in tune. I checked twice.

ROSS: Say it for me. Just the first line.

NELL: I came back for the piano.

ROSS: Good. Now forget about me and go and say it to them.

KIT: (on headset) Places, please. Places for the top of the show.

NELL: Ross?

ROSS: Hm?

NELL: If I dry, feed me the line.

ROSS: You won't dry. And if you do, the piano will.

(The house lights fade. NELL steps into the light.)
`;
  if (typeof module === 'object' && module.exports) module.exports = SAMPLE;
  else root.SAMPLE_SCRIPT = SAMPLE;
})(typeof self !== 'undefined' ? self : this);
