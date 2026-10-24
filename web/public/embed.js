// Builds the YouTube player for embed.html. Only a strict 11-character video id
// from the `v` query parameter ever reaches the player URL (same rule as
// `youtubeId()` in the app); anything else shows a short message instead.
(function () {
  var id = new URLSearchParams(location.search).get("v");
  if (!id || !/^[A-Za-z0-9_-]{11}$/.test(id)) {
    var p = document.createElement("p");
    p.textContent = "No video.";
    document.body.appendChild(p);
    return;
  }
  var frame = document.createElement("iframe");
  frame.src = "https://www.youtube-nocookie.com/embed/" + id + "?autoplay=1";
  frame.allow = "autoplay; encrypted-media";
  frame.setAttribute("allowfullscreen", "");
  frame.title = "YouTube";
  document.body.appendChild(frame);
})();
