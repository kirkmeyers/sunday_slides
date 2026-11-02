// "Sunday - Life of Jacob" ProPresenter theme (Life of Jacob series).
// Theme.bin is a straight copy of the theme's `Theme` file; layouts below name
// which template slide and text boxes each kind of slide uses. The theme has
// no image assets of its own (backgrounds come from the video layer).

import themeUrl from './Theme.bin?url';

export default {
  id: 'life-of-jacob',
  name: 'Sunday - Life of Jacob',
  themeUrl,
  assets: {},
  // Gotham and Acros are licensed fonts, so they aren't bundled. The browser
  // uses the copies installed on the computer (by these names), or on a
  // development Mac the files in reference/fonts (gitignored).
  fonts: {
    'Gotham-Book': { family: 'Gotham', weight: 400, local: ['Gotham Book', 'Gotham-Book'], file: 'Gotham-Book.otf' },
    'Gotham-Light': { family: 'Gotham', weight: 300, local: ['Gotham Light', 'Gotham-Light'], file: 'Gotham-Light.otf' },
    AcrosRegular: { family: 'Acros', weight: 400, local: ['Acros', 'AcrosRegular'], file: 'Acros.ttf' },
  },
  layouts: {
    // Scripture and quotes: reference (or author) above the justified text
    scripture: { slide: 'LOJ Scripture and Quote', text: 'Bible Text', reference: 'Reference' },
    point: { slide: 'Point' },
    // Communicator's name, with the sermon title beneath
    nameplate: { slide: 'LOJ Nameplate - Gotham', text: 'Name', reference: 'Title' },
  },
};
