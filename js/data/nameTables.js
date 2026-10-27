(function (LP) {
  'use strict';

  /*
   * Starter name tables, copied into each new campaign (campaign.nameTables; see js/rules/names.js).
   *
   *   GENERIC   id of the generic table: it can't be deleted or emptied, and species with no table use it
   *   TABLES    [{ id, name, names: [string] }]
   *   SPECIES   speciesId -> [tableId]  default tables per species (the tables are drawn in order and joined)
   *   GROUPS    group -> [tableId]      used when a species has no entry of its own
   */

  const words = (text) => text.split(/\s*,\s*/).filter(Boolean);

  const GENERIC = 'generic';

  const TABLES = [
    {
      id: GENERIC,
      name: 'Generic names',
      names: words('Ash, Blaze, Cade, Dune, Ember, Flint, Gale, Hawk, Iron, Jinx, Kit, Lark, Moss, Nova, Onyx, Pike, Quinn, Rune, Sage, Tarn')
    },
    {
      id: 'human-first',
      name: 'Human first names',
      names: words('Ava, Jonas, Mira, Tomas, Kess, Dara, Rhys, Ilse, Marek, Sunny, Oren, Lena, Cal, Nadia, Teo, Bree, Hollis, Yara, Dax, Petra, Silas, Wren, Anders, Zora, Lucan, Maeve, Rafe, Isolde, Corin, Talia, Bram, Odessa, Fenn, Livia, Joss, Priya, Emeka, Sasha, Noor, Gideon')
    },
    {
      id: 'human-last',
      name: 'Human surnames',
      names: words('Vance, Okafor, Reyes, Halloran, Tanaka, Voss, Mbeki, Castellan, Ferreira, Lindqvist, Okonkwo, Draper, Sato, Brandt, Quill, Moreau, Kowalski, Navarro, Ashby, Petrov, Idris, Calloway, Stroud, Marlowe, Ngata, Rourke, Haldane, Whitlock, Zhao, Delacroix, Pryce, Abara, Lund, Corvin, Santos, Thorne, Basu, Keane, Rask, Ito')
    },
    {
      id: 'bot-prefix',
      name: 'Bot prefixes',
      names: words('Unit, Servo, Cog, Rivet, Hex, Auto, Tin, Rook, Dyna, Volt, Axle, Gantry, Relay, Boltz, Chassis, Vector, Mecha, Delta, Sigma, Bishop')
    },
    {
      id: 'bot-suffix',
      name: 'Bot suffixes',
      names: words('7, 12, 404, Mk II, Alpha, Prime, Zero, 9X, 3B, Omega, Seven, Nine, 88, Minor, Major, V2, Null, 6C, Ten, Echo')
    },
    {
      id: 'engineer',
      name: 'Engineer names',
      names: words('Ixx-Taal, Vorn Kesh, Quill Aarn, Thessk, Dulan-Ree, Brask Oumm, Neph Illis, Harrok, Sivv Dar, Ormuth, Pell-Zan, Kaddix, Yuun Tesh, Ruvak, Elm-Orro, Tazz Brenn')
    },
    {
      id: 'kerin',
      name: 'Kerin names',
      names: words('Gruk, Brannoch, Thraka, Dorvak, Hurgan, Skarrow, Vorg, Ketch, Mazrok, Ulgar, Bregga, Torvash, Grimlok, Rakka, Dunnoch, Ozgar')
    },
    {
      id: 'soulless',
      name: 'Soulless names',
      names: words('Vael, Ysolde, Seren, Ophir, Cael, Iris-9, Lumen, Thane, Veyra, Aurel, Cendre, Nox, Ilyan, Sable, Merrow, Quiet')
    },
    {
      id: 'precursor',
      name: 'Precursor names',
      names: words('Anuun, Ke-Thari, Oshael, Mir-Ennu, Zahlune, Iridax, Ophrenn, Telhar, Aeon-Ka, Ushemar, Valoth, Seshune, Nhar-Ilu, Ordessa, Kyrru, Elaith')
    },
    {
      id: 'feral',
      name: 'Feral names',
      names: words('Snarl, Tuk, Brindle, Rook, Scratch, Ash, Mud, Thorn, Gnash, Wisp, Hob, Burr, Pike, Nettle, Skitter, Gristle, Bracken, Flint')
    },
    {
      id: 'swift',
      name: 'Swift names',
      names: words('Zip, Flit, Tiri, Skree, Quickfoot, Whisk, Veel, Sprint, Pip, Dart, Trill, Zeph, Kiki, Rill, Tweeze, Nim, Chirr, Scud')
    },
    {
      id: 'strange',
      name: 'Strange names',
      names: words('Whisper, The Quiet One, Echo, Mr. Nobody, Cipher, Hollow, Vesper, Lacuna, Omen, Specter, Wanderer, Mirage, Enigma, Nameless, Penumbra, Riddle, Umbra, Halcyon, Oracle, Veil, Anomaly, Drift, Sphinx, Cinder, Eidolon, Paradox')
    }
  ];

  const SPECIES = {
    'baseline-human': ['human-first', 'human-last'],
    bot: ['bot-prefix', 'bot-suffix'],
    engineer: ['engineer'],
    kerin: ['kerin'],
    soulless: ['soulless'],
    precursor: ['precursor'],
    feral: ['feral'],
    swift: ['swift']
  };

  const GROUPS = { strange: ['strange'] };

  LP.data = LP.data || {};
  LP.data.nameTables = { GENERIC, TABLES, SPECIES, GROUPS };
})(window.LP);
