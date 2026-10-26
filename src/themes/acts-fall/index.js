// "_Sunday Acts - Fall" ProPresenter theme (Fall 2026 Acts series).
// Theme.bin is a straight copy of the theme's `Theme` file; layouts below name
// which template slide and text boxes each kind of slide uses.

import themeUrl from './Theme.bin?url';
import contentBarUrl from './003_ActsFall_ContentBar.png?url';

export default {
  id: 'acts-fall',
  name: 'Sunday Acts - Fall',
  themeUrl,
  // Image fills in the theme, by file name -> bundled copy
  assets: {
    '003_ActsFall_ContentBar.png': contentBarUrl,
  },
  // PostScript names used in the theme's RTF -> web fonts bundled in src/fonts
  fonts: {
    'Lato-Light': { family: 'Lato', weight: 300 },
    'Oswald-SemiBold': { family: 'Oswald', weight: 600 },
  },
  layouts: {
    // Scripture and quotes: text right of the bar, reference (or author) left of it
    scripture: { slide: 'Scripture or Quote', text: 'Bible Text', reference: 'Reference' },
    // Points and other on-screen text: one centered box
    point: { slide: 'Point' },
  },
};
