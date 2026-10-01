document.addEventListener('DOMContentLoaded', function () {
  // Copy BibTeX to clipboard. Falls back to selecting the text if the clipboard API is unavailable.
  var btn = document.getElementById('copy-bib');
  var code = document.getElementById('bib-text');
  if (!btn || !code) return;

  btn.addEventListener('click', function () {
    var label = btn.querySelector('span');
    var done = function () {
      label.textContent = 'Copied';
      setTimeout(function () { label.textContent = 'Copy'; }, 1500);
    };
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(code.textContent).then(done);
    } else {
      var range = document.createRange();
      range.selectNodeContents(code);
      var sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    }
  });
});
