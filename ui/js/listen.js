// Listen page: real Korean podcasts (RSS feeds) and YouTube channels, the player dock at the bottom of every page,
// offline episode downloads, shadowing, and the links to the mini window and the tray.
//
// Needs from earlier scripts: $, P, save, show, view, icon, seal, toast, ask, todayStats, timeAgo, hashFrac,
// findWords, dueKeys, VOCAB, recordClip, micHelp (and clipWords / focusState when they exist).
//
// Provides to later scripts and the tests:
// - shared helpers: tauri, openLink, naverUrl, papagoUrl, esc, fmt, lsGet, lsSet, dateOf, fetchText, plain
// - shows and feeds: PODCASTS, CHANNELS, MY_SHOWS, feeds, loadFeed, uploadsViaPlayer
// - the player: NP (now playing), PL (play / pause / seek / time), playEp, playVid, stopAll, update, refresh,
//   duck / unduck, remember, rate, remote
// - downloads: DL, DLM, DLING, toggleDownload; listening history: EPOS, PLAYED
// - the page: LV (its state), renderListen; shadowing: SH; tray: trayOn, renderTray
//
// Feeds were checked when added (Nov 2026). A dead feed only shows "couldn't load"; replace it here.
const PODCASTS=[
  {id:'ttmik',name:'Talk To Me In Korean',level:'Lessons · all levels',seal:'톡',color:'',feed:'https://rss.libsyn.com/shows/18454/destinations/12619.xml'},
  {id:'smalltalk',name:'Small Talk Café',level:'Short dialogues',seal:'카페',color:'gold',feed:'https://feeds.castos.com/2m766'},
  {id:'yeoni',name:'Easy Korean with Yeoni Ssaem',level:'Easy Korean',seal:'연이',color:'jade',feed:'https://anchor.fm/s/db958680/podcast/rss'},
  {id:'julia',name:'Easy Korean Listening with Julia',level:'Easy Korean',seal:'듣기',color:'blue',feed:'https://anchor.fm/s/10b985f24/podcast/rss'},
  {id:'conv',name:'Conversational Korean',level:'Conversations',seal:'대화',color:'',feed:'https://www.spreaker.com/show/7056552/episodes/feed'},
  {id:'sbs',name:'고현준의 뉴스 브리핑 (SBS)',level:'Native-speed news',seal:'뉴스',color:'blue',feed:'https://wizard2.sbs.co.kr/w3/podcast/V2000010540.xml'},
];
// YouTube channel ids; the latest videos come from youtube.com/feeds/videos.xml
const CHANNELS=[
  {id:'UC5r3WHrX4Z7peSYpDlgktGw',name:'Talk To Me In Korean',level:'Lessons · all levels',seal:'톡',color:''},
  {id:'UCcA88_Z7wQWMoQ9bKwjuanA',name:'Korean Unnie 한국언니',level:'Lessons & culture',seal:'언니',color:'jade'},
  {id:'UC7ynjArlSFuXW23ssZAknyA',name:'GO! Billy Korean',level:'Lessons',seal:'빌리',color:'gold'},
  {id:'UCsgBUobNGksxIKTagZayKEw',name:'KoreanClass101',level:'Lessons · all levels',seal:'101',color:'blue'},
  {id:'UCJpIsrXze5HT3X64LDIIHUg',name:'Korean with Miss Vicky 빅키쌤',level:'Lessons',seal:'빅키',color:''},
];

// The Tauri bridge; undefined when the page runs in a plain browser
const tauri = window.__TAURI__;

// Opens a web page in the default browser (the app window never navigates away)
const openLink = url => {
  if (tauri) {
    return tauri.core.invoke('open_external', {url}).catch(() => {});
  }
  return open(url, '_blank');
};

// Look up Korean outside the app: Naver's Korean-English dictionary for words, Papago for sentences
const naverUrl = word => 'https://korean.dict.naver.com/koendict/#/search?query=' + encodeURIComponent(word);
const papagoUrl = sentence => 'https://papago.naver.com/?sk=ko&tk=en&st=' + encodeURIComponent(sentence);

// Escapes text for HTML: feed text is untrusted
const esc = text => {
  const entities = {'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'};
  return String(text ?? '').replace(/[&<>"']/g, char => entities[char]);
};

// Seconds as a clock: "4:05" or "1:02:05"
const fmt = seconds => {
  const total = Math.max(0, Math.floor(seconds || 0));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor(total / 60) % 60;
  const secs = String(total % 60).padStart(2, '0');
  if (hours) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${secs}`;
  }
  return `${minutes}:${secs}`;
};

// localStorage as JSON. Reads fall back to `fallback`; writing null or undefined removes the key.
const lsGet = (key, fallback) => {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch (e) {
    return fallback;
  }
};
const lsSet = (key, value) => {
  try {
    if (value == null) {
      localStorage.removeItem(key);
    } else {
      localStorage.setItem(key, JSON.stringify(value));
    }
  } catch (e) {}
};

const dateOf = time => {
  if (!time) return '';
  return new Date(time).toLocaleDateString(undefined, {year: 'numeric', month: 'short', day: 'numeric'});
};

// ---- Feeds: downloaded by the Rust app (curl.exe, no CORS) every time a show is opened, newest first.
// The last copy is saved so the list shows instantly while checking, and still works offline. ----
const fetchText = url => {
  if (tauri) {
    return tauri.core.invoke('fetch_text', {url});
  }
  return fetch(url).then(response => {
    if (!response.ok) throw Error('HTTP ' + response.status);
    return response.text();
  });
};

// Show id -> {at, items, about, viaPlayer?}: the feeds loaded or read back from localStorage ('feed:<id>')
const feeds = {};

const newestFirst = list => list.sort((a, b) => b.date - a.date);

// Text of the first <name> element inside el, trimmed ('' when there is none)
const tag = (el, name) => el.getElementsByTagName(name)[0]?.textContent?.trim() || '';

// HTML to plain text on one line
const plain = html => {
  const text = new DOMParser().parseFromString(html, 'text/html').body.textContent;
  return text.replace(/\s+/g, ' ').trim();
};

// A podcast RSS feed -> {items: the newest 40 episodes, about: the show's description (220 chars at most)}
function parsePodcast(xml) {
  const doc = new DOMParser().parseFromString(xml, 'text/xml');
  const channel = doc.getElementsByTagName('channel')[0];
  if (!channel) throw Error('not a podcast feed');

  // The show's own <itunes:summary> and <description> are direct children of <channel>; every episode has them too,
  // so only direct children count (else a show without a summary would show its first episode's)
  const ownTag = name => [...channel.children].find(child => child.tagName === name)?.textContent?.trim();
  const about = plain(ownTag('itunes:summary') || ownTag('description') || '');

  const toEpisode = item => {
    const duration = tag(item, 'itunes:duration');
    const enclosure = () => item.getElementsByTagName('enclosure')[0];
    return {
      title: tag(item, 'title'),
      desc: plain(tag(item, 'description') || tag(item, 'itunes:summary')).slice(0, 1500),
      date: Date.parse(tag(item, 'pubDate')) || 0,
      url: enclosure()?.getAttribute('url') || '',
      size: +enclosure()?.getAttribute('length') || 0,
      // itunes:duration is either plain seconds ("1834") or a clock ("00:30:34")
      dur: /^\d+$/.test(duration) ? fmt(+duration) : duration.replace(/^00:/, ''),
    };
  };
  // http audio is moved to https; episodes without an https audio link are dropped
  const items = [...doc.getElementsByTagName('item')]
    .map(toEpisode)
    .map(episode => ({...episode, url: episode.url.replace(/^http:\/\//, 'https://')}))
    .filter(episode => /^https:\/\//.test(episode.url));

  return {
    items: newestFirst(items).slice(0, 40),
    about: about.length > 220 ? about.slice(0, 217) + '…' : about,
  };
}

// A YouTube channel or playlist feed -> {items: the videos, newest first, about}
function parseYouTube(xml) {
  const doc = new DOMParser().parseFromString(xml, 'text/xml');
  const toVideo = entry => ({
    id: tag(entry, 'yt:videoId'),
    title: tag(entry, 'title'),
    desc: tag(entry, 'media:description').slice(0, 1500),
    date: Date.parse(tag(entry, 'published')) || 0,
    short: (entry.getElementsByTagName('link')[0]?.getAttribute('href') || '').includes('/shorts/'),
  });
  const all = [...doc.getElementsByTagName('entry')]
    .map(toVideo)
    .filter(video => /^[\w-]{11}$/.test(video.id));
  // Shorts only when the channel has few full videos
  const fullVideos = all.filter(video => !video.short);
  return {
    items: newestFirst(fullVideos.length >= 6 ? fullVideos : all),
    about: 'Latest videos from this channel.',
  };
}

// ---- Your own shows: any podcast RSS link or YouTube channel, kept on this computer after the built-in ones ----
const MY_SHOWS = lsGet('myShows', {pod: [], yt: []});
PODCASTS.push(...MY_SHOWS.pod);
CHANNELS.push(...MY_SHOWS.yt);

// Two letters of the show's name for its seal stamp
const sealOf = name => [...String(name).replace(/[^가-힣A-Za-z0-9]/g, '')].slice(0, 2).join('') || '♪';

// Adds a show from what the learner pasted: an RSS link on the podcast tab, a channel id or link on the YouTube tab.
// Throws an Error with a message for the learner when the input doesn't work. Returns the new show.
async function addShow(tab, input) {
  const pasted = String(input || '').trim();

  const keep = (show, list, savedList) => {
    list.push(show);
    savedList.push(show);
    lsSet('myShows', MY_SHOWS);
    return show;
  };

  const addPodcast = async () => {
    if (!/^https:\/\/[^\s"]+$/.test(pasted)) throw Error('Paste the podcast’s RSS link (it starts with https://).');
    if (PODCASTS.some(podcast => podcast.feed === pasted)) throw Error('That podcast is already on the list.');
    const xml = await fetchText(pasted);
    const channel = new DOMParser().parseFromString(xml, 'text/xml').getElementsByTagName('channel')[0];
    if (!channel) throw Error('That link is not a podcast feed. Look for “RSS” on the podcast’s page.');
    const name = (tag(channel, 'title') || 'My podcast').slice(0, 80);
    const show = {
      id: 'u' + (hashFrac(pasted) * 1e9 | 0).toString(36),
      name,
      level: 'Added by you',
      seal: sealOf(name),
      color: '',
      feed: pasted,
      mine: true,
    };
    return keep(show, PODCASTS, MY_SHOWS.pod);
  };

  const addChannel = async () => {
    const id = (pasted.match(/UC[\w-]{22}/) || [])[0];
    if (!id) {
      throw Error('Paste the channel ID (it starts with UC) or a youtube.com/channel/UC… link. '
        + 'On a channel page: About › Share › Copy channel ID.');
    }
    if (CHANNELS.some(channel => channel.id === id)) throw Error('That channel is already on the list.');
    // The channel's name, if YouTube's list answers
    let name = 'YouTube channel';
    try {
      const doc = new DOMParser().parseFromString(await fetchFeed({id}), 'text/xml');
      name = tag(doc, 'title').slice(0, 80) || name;
    } catch (e) {}
    const show = {id, name, level: 'Added by you', seal: sealOf(name), color: '', mine: true};
    return keep(show, CHANNELS, MY_SHOWS.yt);
  };

  if (tab === 'pod') {
    return addPodcast();
  }
  return addChannel();
}

// Removes one of your own shows (after asking) and goes back to the show grid
async function removeShow(src) {
  const confirmed = await ask({
    title: 'Remove this show?',
    text: '“' + src.name + '” leaves your list. You can add it again any time.',
    ok: 'Remove',
    danger: true,
    sealText: '×',
  });
  if (!confirmed) return;
  const kind = src.feed ? 'pod' : 'yt';
  const list = src.feed ? PODCASTS : CHANNELS;
  list.splice(list.indexOf(src), 1);
  MY_SHOWS[kind] = MY_SHOWS[kind].filter(show => show.id !== src.id);
  lsSet('myShows', MY_SHOWS);
  delete feeds[src.id];
  localStorage.removeItem('feed:' + src.id);
  LV.open = null;
  renderListen();
}

// The "Add a podcast / Add a YouTube channel" form under the show grid
const addShowForm = tab => {
  const label = tab === 'pod' ? 'Add a podcast' : 'Add a YouTube channel';
  const placeholder = tab === 'pod' ? 'RSS link: https://…' : 'Channel ID (UC…) or youtube.com/channel/UC… link';
  const input = `<input id="addShowIn" autocomplete="off" spellcheck="false" placeholder="${placeholder}">`;
  return [
    `<form class="add-show" data-addshow><label for="addShowIn">${label}</label>`,
    `<div class="add-row">${input}<button class="btn" type="submit">${icon('plus')}Add</button></div>`,
    `<small class="set-msg" id="addShowMsg"></small></form>`,
  ].join('\n  ');
};

// The feed already in memory, or the copy saved last time (undefined when there is none)
const savedFeed = src => {
  if (!feeds[src.id]) {
    feeds[src.id] = lsGet('feed:' + src.id, null) || undefined;
  }
  return feeds[src.id];
};

// Always asks the publisher for the current list. On failure it throws and the saved copy (if any) stays on screen.
// YouTube's feed service sometimes answers 404/500 for a moment: try again (also via the channel's uploads playlist).
async function fetchFeed(src) {
  if (src.feed) {
    return fetchText(src.feed);
  }
  // A channel's uploads playlist is its id with UC changed to UU
  const urls = [
    `https://www.youtube.com/feeds/videos.xml?channel_id=${src.id}`,
    `https://www.youtube.com/feeds/videos.xml?playlist_id=UU${src.id.slice(2)}`,
  ];
  for (let attempt = 0; ; attempt++) {
    try {
      return await fetchText(urls[attempt % 2]);
    } catch (error) {
      if (attempt === 2) throw error;
      await new Promise(resolve => setTimeout(resolve, 1200 * (attempt + 1)));
    }
  }
}

// When YouTube's feed is down (it has answered 404 for every channel at times), the list comes from YouTube's own
// embedded player instead: it is asked to cue the channel's uploads playlist and reports the video ids (getPlaylist);
// each title comes from YouTube's public oEmbed endpoint. Official interfaces only, no key.
// Dates aren't available that way.
// The player sometimes stays silent, so up to 3 tries (12 s each), alternating the two ways of loading a list:
// cue = true cues the list once the player is ready, cue = false loads it through the player's settings.
function playlistIds(list, cue) {
  // Invisible; a tiny or off-screen player never loads the list
  const box = document.createElement('div');
  box.style.cssText = 'position:fixed;left:0;top:0;width:320px;height:320px;opacity:0;pointer-events:none';
  const playerElement = document.createElement('div');
  box.append(playerElement);
  document.body.append(box);

  let player = null;
  let pollTimer = 0;
  let giveUpTimer = 0;
  return new Promise((resolve, reject) => {
    giveUpTimer = setTimeout(() => reject(Error('YouTube did not answer')), 12000);
    const onReady = () => {
      if (cue) {
        player.cuePlaylist({listType: 'playlist', list});
      }
      pollTimer = setInterval(() => {
        const ids = player.getPlaylist?.();
        if (ids?.length) resolve(ids);
      }, 300);
    };
    const onError = event => reject(Error('YouTube player error ' + event.data));
    player = new YT.Player(playerElement, {
      host: 'https://www.youtube-nocookie.com',
      width: 320,
      height: 320,
      ...(cue ? {} : {playerVars: {listType: 'playlist', list}}),
      events: {onReady, onError},
    });
  }).finally(() => {
    clearTimeout(giveUpTimer);
    clearInterval(pollTimer);
    try {
      player?.destroy();
    } catch {}
    box.remove();
  });
}

// A channel's latest 20 videos (no dates) through YouTube's player and oEmbed, for when its feed is down
async function uploadsViaPlayer(src) {
  await ytApi();
  const list = 'UU' + src.id.slice(2);
  let ids = null;
  let lastError;
  for (let attempt = 0; attempt < 3 && !ids; attempt++) {
    ids = await playlistIds(list, attempt % 2 === 0).catch(error => {
      lastError = error;
      return null;
    });
  }
  if (!ids) throw lastError;

  const fetchTitle = id => {
    const url = `https://www.youtube.com/oembed?format=json&url=https://www.youtube.com/watch?v=${id}`;
    // a failed or garbled answer only loses that one video, not the whole list
    return fetchText(url)
      .then(text => ({id, title: String(JSON.parse(text).title || ''), desc: '', date: 0}))
      .catch(() => null);
  };
  const validIds = ids.filter(id => /^[\w-]{11}$/.test(id)).slice(0, 20);
  const items = await Promise.all(validIds.map(fetchTitle));
  return items.filter(video => video?.title);
}

// Downloads a show's feed, saves it ('feed:<id>') and returns it. Throws when nothing could be loaded.
async function loadFeed(src) {
  let feed;
  if (src.feed) {
    feed = parsePodcast(await fetchFeed(src));
  } else {
    try {
      feed = parseYouTube(await fetchFeed(src));
    } catch (e) {
      const items = await uploadsViaPlayer(src).catch(() => []);
      if (!items.length) {
        throw Error('YouTube’s video list is down right now (their side, not the app or your internet)');
      }
      feed = {
        items,
        about: 'Latest videos from this channel. '
          + 'YouTube’s list service is down, so this list comes from YouTube’s player (no dates).',
        viaPlayer: true,
      };
    }
  }
  feed = {at: Date.now(), ...feed};
  if (!feed.items.length) throw Error('no episodes found');
  lsSet('feed:' + src.id, feed);
  // Re-read the playing episode's words from the new list
  epKey = '';
  return feeds[src.id] = feed;
}

// ---- Player: one "now playing" (podcast audio or a YouTube video) shared by the dock, mini window and tray ----
// YouTube player states used below: 1 = playing, 2 = paused, 3 = buffering, 5 = cued.
const pod = new Audio();
pod.preload = 'metadata';
// Now playing: {kind: 'pod' | 'yt', src: show id, show, seal, color, title, url (podcast) or id (video)}; saved as 'np'
let NP = null;
// The YouTube player on the Listen page, and the promise of YouTube's iframe API being loaded
let yt = null;
let ytReady = null;
// Where a video starts when it is cued or replayed (seconds)
let resumeAt = 0;
// True while the learner drags the dock's seek bar
let seeking = false;
// Playback speed, shared by podcasts and videos
let rate = lsGet('rate', 1);
let duckT = 0;
// Seconds listened (counts up while playing)
let tick = 0;
// While the mini window is open, a YouTube video plays THERE (a video can only play in one window).
// remote = its last report {id,t,d,state,at}; this window keeps the dock, quests and tray in charge.
let miniOpen = false;
let remote = null;

const ytOn = () => NP?.kind === 'yt';

// Sends a command to the video playing in the mini window
const miniCmd = command => tauri?.event.emit('mini-video-cmd', command).catch(() => {});

// The one set of controls for whatever plays: the podcast audio, the video here, or the video in the mini window
const PL = {
  playing: () => {
    if (ytOn()) {
      if (remote) return remote.state === 1;
      return yt?.getPlayerState?.() === 1;
    }
    return !!NP && !pod.paused;
  },
  time: () => {
    if (!ytOn()) {
      return pod.currentTime || 0;
    }
    if (remote) {
      // the mini window reports now and then: add the time since its last report
      const sinceReport = remote.state === 1 ? (Date.now() - remote.at) / 1000 * rate : 0;
      return remote.t + sinceReport;
    }
    // a cued video is paused at resumeAt
    if (yt?.getCurrentTime && yt.getPlayerState() !== 5) {
      return yt.getCurrentTime();
    }
    return resumeAt;
  },
  dur: () => {
    if (ytOn()) {
      if (remote) return remote.d;
      return yt?.getDuration?.() || 0;
    }
    return pod.duration || 0;
  },
  toggle() {
    if (!NP) return;
    if (ytOn() && remote) {
      miniCmd({cmd: 'toggle'});
    } else if (ytOn()) {
      // no player yet (the video was restored at startup): start it from where it stopped
      if (!yt?.getPlayerState) {
        return playVid(CHANNELS.find(channel => channel.id === NP.src) || NP, NP, resumeAt);
      }
      if (PL.playing()) {
        yt.pauseVideo();
      } else {
        yt.playVideo();
      }
    } else if (pod.paused) {
      pod.play().catch(playErr);
    } else {
      pod.pause();
    }
    setTimeout(refresh, 60);
  },
  seek(t) {
    if (ytOn()) {
      if (remote) {
        miniCmd({cmd: 'seek', t});
      } else {
        yt?.seekTo?.(t, true);
      }
    } else {
      pod.currentTime = t;
    }
    setTimeout(update, 60);
  },
  skip(seconds) {
    const duration = PL.dur();
    const target = PL.time() + seconds;
    PL.seek(Math.max(0, duration ? Math.min(duration - 1, target) : target));
  },
};

const playErr = error => {
  const detail = error?.message ? 'Check your internet connection.' : '';
  toast('sync', 'Could not play this episode', detail, 'volume');
};

// Makes src's episode or video the one now playing (extra holds title and url or id)
function setNow(src, extra) {
  shadowClose();
  NP = {kind: src.feed ? 'pod' : 'yt', src: src.id, show: src.name, seal: src.seal, color: src.color, ...extra};
  if ('mediaSession' in navigator) {
    navigator.mediaSession.metadata = new MediaMetadata({title: NP.title, artist: NP.show, album: 'Hangul Learner'});
  }
  remember();
}

// Moves the current video into the mini window, starting at t.
function sendToMini(playing, t) {
  const duration = PL.dur();
  yt?.pauseVideo?.();
  // state 3 = buffering until the mini window reports
  remote = {id: NP.id, t, d: duration, state: playing ? 3 : 2, at: Date.now()};
  tauri.event.emit('mini-video', {id: NP.id, t, playing, rate}).catch(() => {});
  refresh();
}

// The video comes back from the mini window (or nothing plays there any more)
const dropRemote = () => {
  if (remote) {
    remote = null;
    tauri?.event.emit('mini-video', null).catch(() => {});
  }
};

// ---- Offline episodes: downloaded into the app's data folder, played from there (works without internet) ----
// Episode url -> local file path
let DL = lsGet('dl', {});
// Episode url -> {title, src (show id), date, dur}: for the Downloaded shelf
let DLM = lsGet('dlMeta', {});
// Urls downloading right now -> {got: bytes so far, size: bytes in all (0 = unknown)}
const DLING = new Map();

// Where the audio element plays an episode from: the downloaded file, or the internet
const epSrc = url => {
  if (DL[url] && tauri) {
    return tauri.core.convertFileSrc(DL[url]);
  }
  return url;
};

// The download button of an episode: download it, stop a running download, or delete the downloaded file
async function toggleDownload(item) {
  if (!tauri) return;
  // Tap again while downloading: stop
  if (DLING.has(item.url)) {
    return tauri.core.invoke('cancel_download', {url: item.url});
  }
  if (DL[item.url]) {
    return deleteDownload();
  }
  DLING.set(item.url, {got: 0, size: +item.size || 0});
  renderListen();
  try {
    DL[item.url] = await tauri.core.invoke('download_episode', {url: item.url});
    lsSet('dl', DL);
    DLM[item.url] = {title: item.title, src: LV.open, date: item.date || 0, dur: item.dur || ''};
    lsSet('dlMeta', DLM);
    toast('sync', 'Downloaded', 'Plays without internet now', 'download');
  } catch (error) {
    if (String(error).includes('cancelled')) {
      toast('sync', 'Download stopped', 'The episode still streams from the internet.', 'download');
    } else {
      toast('sync', 'Download failed', String(error).slice(0, 120), 'download');
    }
  } finally {
    DLING.delete(item.url);
    if (view === 'listen') renderListen();
  }

  async function deleteDownload() {
    const confirmed = await ask({
      title: 'Delete this download?',
      text: '“' + item.title + '” will stream from the internet again.',
      ok: 'Delete',
      danger: true,
      sealText: '×',
    });
    if (!confirmed) return;
    await tauri.core.invoke('delete_episodes', {path: DL[item.url]}).catch(() => {});
    delete DL[item.url];
    delete DLM[item.url];
    lsSet('dl', DL);
    lsSet('dlMeta', DLM);
    return renderListen();
  }
}

// Progress of a running download for its button: a percentage when the size is known, else MB or KB so far
const dlText = url => {
  const download = DLING.get(url);
  if (!download) return '';
  const megabytes = download.got / 1048576;
  if (download.size > download.got && download.got) {
    return Math.floor(download.got / download.size * 100) + '%';
  }
  if (megabytes >= 1) {
    return megabytes.toFixed(0) + ' MB';
  }
  if (download.got) {
    return Math.max(1, Math.round(download.got / 1024)) + ' KB';
  }
  return '…';
};

// Download progress, shown on the button while it runs
setInterval(async () => {
  for (const [url, download] of DLING) {
    download.got = await tauri.core.invoke('download_progress', {url}).catch(() => download.got);
    document.querySelectorAll('[data-dlurl]').forEach(button => {
      const percentLabel = button.dataset.dlurl === url && button.querySelector('.dl-pct');
      if (percentLabel) percentLabel.textContent = dlText(url); // a button drawn before the download has no label yet
    });
  }
}, 700);

// The download button of episode number index in the open show ('' in a browser or without audio)
const dlBtn = (item, index) => {
  if (!tauri || !item.url) return '';
  const downloaded = DL[item.url];
  const busy = DLING.has(item.url);
  let title = 'Download to listen offline';
  let label = 'Download';
  if (busy) {
    title = 'Downloading… tap to stop';
    label = 'Stop download';
  } else if (downloaded) {
    title = 'Downloaded: tap to delete';
    label = 'Delete download';
  }
  const classes = `icon-btn dl-btn${downloaded ? ' on' : ''}${busy ? ' busy' : ''}`;
  const content = busy ? `<span class="dl-pct">${dlText(item.url)}</span>` : icon(downloaded ? 'check' : 'download');
  return [
    `<button class="${classes}" data-dl="${index}" data-dlurl="${esc(item.url)}" `,
    `title="${title}" aria-label="${label}">`,
    `${content}</button>`,
  ].join('');
};

// The "Downloaded" shelf under the podcast grid
function dlShelf() {
  const urls = Object.keys(DL);
  if (!tauri || !urls.length) return '';
  const playing = PL.playing();

  const row = url => {
    const meta = DLM[url] || {};
    const show = PODCASTS.find(podcast => podcast.id === meta.src);
    const isNow = NP?.url === url;
    const action = isNow && playing ? 'Pause' : 'Play';
    const title = esc(meta.title || 'Downloaded episode');
    const date = meta.date ? ' · ' + dateOf(meta.date) : '';
    const duration = meta.dur ? ' · ' + esc(meta.dur) : '';
    return [
      `<div class="ep${isNow ? ' now' : ''}">`,
      `<button class="play-btn" data-dlplay="${esc(url)}" aria-label="${action}: ${title}">`,
      `${icon(isNow && playing ? 'pause' : 'play')}</button>`,
      `<div><b>${title}</b><small>${esc(show?.name || 'Podcast')}${date}${duration}</small></div>`,
      `<button class="icon-btn dl-btn on" data-dldel="${esc(url)}" `,
      `title="Downloaded: tap to delete" aria-label="Delete download">`,
      `${icon('check')}</button></div>`,
    ].join('');
  };

  const heading = `<h3 class="shelf-head">${icon('download')}Downloaded · ${urls.length}</h3>`;
  return `${heading}<div class="eps">${urls.map(row).join('')}</div>`;
}

// Plays a podcast episode from where it stopped last time
function playEp(src, episode) {
  dropRemote();
  if (yt?.stopVideo) yt.stopVideo();
  $('ytWrap').hidden = true;
  $('ytNote').hidden = true;
  setNow(src, {title: episode.title, url: episode.url});
  // Carry on where you stopped this episode
  const startAt = EPOS[episode.url] || 0;
  pod.src = epSrc(episode.url) + (startAt ? '#t=' + startAt : '');
  pod.playbackRate = rate;
  pod.play().catch(playErr);
  refresh();
}

// Loads YouTube's iframe API once (tried again after a failure, e.g. when offline)
const ytApi = () => ytReady ??= new Promise((resolve, reject) => {
  window.onYouTubeIframeAPIReady = resolve;
  const script = document.createElement('script');
  script.src = 'https://www.youtube.com/iframe_api';
  script.onerror = () => {
    ytReady = null;
    script.remove();
    reject(Error('offline'));
  };
  document.head.append(script);
});

// Plays video v of channel src from second start, here or in the mini window when it is open
async function playVid(src, v, start = 0) {
  pod.pause();
  setNow(src, {title: v.title, id: v.id});
  resumeAt = start;
  // The mini window is open: play it there
  if (tauri && miniOpen && await tauri.core.invoke('mini_visible')) {
    remote = null;
    $('ytWrap').hidden = true;
    return sendToMini(true, start);
  }
  $('ytWrap').hidden = LV.tab !== 'yt';
  $('ytNote').hidden = true;
  refresh();
  try {
    await ytApi();
  } catch (e) {
    $('ytNote').hidden = false;
    return;
  }
  if (yt?.loadVideoById) {
    yt.loadVideoById({videoId: v.id, startSeconds: start});
    yt.setPlaybackRate(rate);
    return;
  }
  const originVars = location.origin.startsWith('http') ? {origin: location.origin} : {};
  yt = new YT.Player('ytPlayer', {
    videoId: v.id,
    host: 'https://www.youtube-nocookie.com',
    playerVars: {
      autoplay: 1,
      start: Math.floor(start),
      rel: 0,
      playsinline: 1,
      cc_load_policy: 1,
      cc_lang_pref: 'ko',
      ...originVars,
    },
    events: {
      onReady: event => {
        event.target.setPlaybackRate(rate);
        event.target.playVideo();
      },
      onStateChange: refresh,
      onError: () => {
        $('ytNote').hidden = false;
      },
    },
  });
}

// The dock's close button: stop everything and forget what was playing
function stopAll() {
  shadowClose();
  dropRemote();
  pod.pause();
  pod.removeAttribute('src');
  pod.load();
  if (yt?.stopVideo) yt.stopVideo();
  NP = null;
  lsSet('np', null);
  $('ytWrap').hidden = true;
  $('ytNote').hidden = true;
  refresh();
}

// Each podcast episode keeps where you stopped (EPOS, last 100) and is marked played near its end
const EPOS = lsGet('epPos', {});
const PLAYED = lsGet('played', {});

function rememberEp() {
  if (NP?.kind !== 'pod' || !NP.url) return;
  const time = PL.time();
  const duration = PL.dur();
  if (duration && time > duration - 30) {
    PLAYED[NP.url] = 1;
    delete EPOS[NP.url];
    lsSet('played', PLAYED);
  } else if (time > 30) {
    // Delete first so the episode moves to the end of the key order: the oldest one is dropped past 100
    delete EPOS[NP.url];
    EPOS[NP.url] = Math.floor(time);
    const urls = Object.keys(EPOS);
    if (urls.length > 100) delete EPOS[urls[0]];
  }
  lsSet('epPos', EPOS);
}

// Saves what is playing and where ('np'), so the app can resume it after a restart
const remember = () => {
  if (!NP) return;
  lsSet('np', {...NP, t: Math.floor(PL.time())});
  rememberEp();
};

// " · played" or " · stopped at 12:34" after an episode's date
const epMark = url => {
  if (PLAYED[url]) {
    return ` · <span class="ep-played">${icon('check')}played</span>`;
  }
  if (EPOS[url]) {
    return ` · stopped at ${fmt(EPOS[url])}`;
  }
  return '';
};

// App words found in the playing episode's title and description (cached per episode)
let epKey = '';
let epList = [];
const itemWords = item => findWords(`${item.title} ${item.desc || ''}`);

function episodeWords() {
  const key = NP ? (NP.url || NP.id) : '';
  if (key === epKey) return epList;
  epKey = key;
  let item = null;
  if (NP) {
    const feed = feeds[NP.src] || lsGet('feed:' + NP.src, null);
    item = feed?.items.find(entry => (entry.url || entry.id) === key);
  }
  if (!item) {
    return epList = [];
  }
  return epList = itemWords(item).slice(0, 30).map(word => ({ch: word.ch, meaning: word.meaning, say: word.say}));
}

// Dock (bottom of every page) + state for the mini window. refresh() also redraws the episode list.
const refresh = () => {
  update();
  if (view === 'listen') renderListen();
};

// Quieter podcast / video while a word plays (main window or mini window)
function duck(ms = 1800) {
  pod.volume = .2;
  yt?.setVolume?.(20);
  clearTimeout(duckT);
  duckT = setTimeout(unduck, ms);
}

function unduck() {
  clearTimeout(duckT);
  pod.volume = 1;
  yt?.setVolume?.(100);
}

// Redraws the dock and, while the mini window is open, sends it the player state
function update() {
  $('dock').hidden = !NP;
  if (NP) {
    drawDock();
  }
  if (!miniOpen) return;
  sendMiniState();

  function drawDock() {
    const playing = PL.playing();
    const time = PL.time();
    const duration = PL.dur();
    $('dSeal').innerHTML = seal(esc(NP.seal), 'm', NP.color);
    $('dTitle').textContent = NP.title;
    $('dShow').textContent = NP.show;
    $('dPlay').innerHTML = icon(playing ? 'pause' : 'play');
    $('dPlay').setAttribute('aria-label', playing ? 'Pause' : 'Play');
    if (!seeking) {
      $('dSeek').value = duration ? time / duration * 1000 : 0;
      $('dTime').textContent = duration ? `${fmt(time)} / ${fmt(duration)}` : fmt(time);
    }
    $('dRate').textContent = rate + '×';
  }

  // The mini window's word card: copied Korean first, then words from the playing episode,
  // then words due for Smart review, then your level
  function sendMiniState() {
    const due = dueKeys(P)
      .slice(0, 30)
      .map(key => VOCAB.find(word => word.ch === key))
      .filter(Boolean)
      .map(word => ({ch: word.ch, meaning: word.meaning, say: word.say}));
    const ep = episodeWords();
    tauri?.event.emit('player-state', {
      ep,
      clip: typeof clipWords === 'function' ? clipWords() : [],
      focus: typeof focusState === 'function' ? focusState() : null,
      saved: (P.notebook || []).map(word => word.ch),
      ...(NP && {
        title: NP.title,
        show: NP.show,
        seal: NP.seal,
        color: NP.color,
        playing: PL.playing(),
        t: PL.time(),
        d: PL.dur(),
      }),
      section: P.section || 0,
      due,
    }).catch(() => {});
  }
}

['play', 'pause', 'ended', 'loadedmetadata'].forEach(eventName => pod.addEventListener(eventName, () => {
  refresh();
  remember();
}));
pod.addEventListener('error', () => NP && !ytOn() && pod.getAttribute('src') && playErr({message: 'network'}));

// Every second: move the dock, and count listening time toward today's quests (saved once a minute)
setInterval(() => {
  if (!NP) return;
  if (PL.playing()) {
    const today = todayStats(P);
    today.podcastSec = (today.podcastSec || 0) + 1;
    P.totals.listenSec = (P.totals.listenSec || 0) + 1;
    tick++;
    if (tick % 60 === 0) save();
    if (tick % 5 === 0) remember();
  }
  if (!$('dock').hidden) update();
}, 1000);

$('dPlay').onclick = () => PL.toggle();
$('dBack').onclick = () => PL.skip(-15);
$('dFwd').onclick = () => PL.skip(30);
$('dClose').onclick = stopAll;

// Sleep timer: the ☾ button cycles off -> 15 -> 30 -> 60 minutes -> off
let sleepAt = 0;
const SLEEPS = [0, 15, 30, 60];

function sleepLabel() {
  const minutesLeft = sleepAt ? Math.max(1, Math.ceil((sleepAt - Date.now()) / 60000)) : 0;
  $('dSleep').textContent = minutesLeft ? `☾ ${minutesLeft}m` : '☾';
  $('dSleep').setAttribute('aria-pressed', !!minutesLeft);
}

$('dSleep').onclick = () => {
  const minutesLeft = sleepAt ? Math.ceil((sleepAt - Date.now()) / 60000) : 0;
  const next = SLEEPS.find(minutes => minutes > minutesLeft) || 0;
  sleepAt = next ? Date.now() + next * 60000 : 0;
  sleepLabel();
  if (next) toast('sync', 'Sleep timer', `Playback stops in ${next} minutes.`, 'clock');
};

setInterval(() => {
  if (!sleepAt) return;
  if (Date.now() >= sleepAt) {
    sleepAt = 0;
    if (PL.playing()) PL.toggle();
  }
  sleepLabel();
}, 5000);

$('dRate').onclick = () => {
  const rates = [0.5, 0.75, 1, 1.25, 1.5];
  rate = rates[(rates.indexOf(rate) + 1) % rates.length];
  lsSet('rate', rate);
  pod.playbackRate = rate;
  yt?.setPlaybackRate?.(rate);
  if (remote) miniCmd({cmd: 'rate', r: rate});
  update();
};

// The seek bar runs 0..1000
$('dSeek').oninput = event => {
  seeking = true;
  const duration = PL.dur();
  $('dTime').textContent = `${fmt(event.target.value / 1000 * duration)} / ${fmt(duration)}`;
};
$('dSeek').onchange = event => {
  seeking = false;
  PL.seek(event.target.value / 1000 * PL.dur());
};

$('dMini').onclick = $('lMini').onclick = () => {
  if (tauri) {
    return tauri.core.invoke('toggle_mini');
  }
  return toast('sync', 'Mini player', 'The mini player works in the desktop app.', 'pip');
};
$('ytOpen').onclick = () => {
  return NP && tauri?.core.invoke('open_external', {url: `https://www.youtube.com/watch?v=${NP.id}`});
};

// ---- Shadowing: replay a 5-second piece, record yourself saying it, then compare ----
// {a, b: the piece's start and end in seconds, url: your recording, timer, rec: recording now, done: shPlay's resolve}
let SH = null;

function shadowOpen() {
  if (!NP) return;
  if (SH) return shadowClose();
  const time = PL.time();
  const length = shLen();
  SH = {a: Math.max(0, time - length), b: Math.max(length, time), url: null};
  $('shadow').hidden = false;
  $('dShadow').setAttribute('aria-pressed', true);
  renderShadow();
  shPlay();
}

function shadowClose() {
  if (!SH) return;
  shStop(SH);
  if (SH.url) URL.revokeObjectURL(SH.url);
  SH = null;
  $('shadow').hidden = true;
  $('dShadow').setAttribute('aria-pressed', false);
}

// The piece length in seconds, chosen with the "5 s" button and saved as 'shLen'
const SH_LENS = [3, 5, 8];
const shLen = () => {
  const saved = +lsGet('shLen', 5);
  return SH_LENS.includes(saved) ? saved : 5;
};

$('shLen').onclick = () => {
  const length = SH_LENS[(SH_LENS.indexOf(shLen()) + 1) % SH_LENS.length];
  lsSet('shLen', length);
  if (SH) {
    SH.b = Math.min(PL.dur() || Infinity, SH.a + length);
    shPlay();
  }
  renderShadow();
};

function renderShadow() {
  if (!SH) return;
  $('shLen').textContent = shLen() + ' s';
  $('shSeg').textContent = `${fmt(SH.a)} – ${fmt(SH.b)}`;
  $('shMine').disabled = $('shBoth').disabled = !SH.url;
}

// Plays the piece once, then pauses (a seek can take a moment, so the end check waits a little).
// Resolves true when the piece played to its end, false when something else (Replay, Next, Close) took over.
function shPlay() {
  return new Promise(resolve => {
    const piece = SH;
    if (!piece) return resolve(false);
    shStop(piece);
    piece.done = resolve;
    PL.seek(piece.a);
    if (!PL.playing()) PL.toggle();
    const startedAt = Date.now();
    // Safety net: stop anyway 4 s after the piece should have ended
    const maxMs = (piece.b - piece.a) / rate * 1000 + 4000;
    piece.timer = setInterval(() => {
      const elapsed = Date.now() - startedAt;
      if (SH !== piece) return shStop(piece);
      const reachedEnd = elapsed > 300 && PL.time() >= piece.b - 0.05;
      if (elapsed > maxMs || reachedEnd) {
        if (PL.playing()) PL.toggle();
        shStop(piece, true);
      }
    }, 80);
  });
}

// Stops the piece's end check and settles its shPlay promise
function shStop(piece, ended = false) {
  clearInterval(piece.timer);
  const done = piece.done;
  piece.done = null;
  done?.(ended);
}

// Plays a sound file; resolves when it ends or fails
const playUrl = url => new Promise(resolve => {
  const audio = new Audio(url);
  audio.onended = audio.onerror = resolve;
  audio.play().catch(resolve);
});

// Records the learner saying the piece (as long as the piece, plus a second), then plays it back
async function shRecord() {
  const piece = SH;
  if (!piece || piece.rec) return;
  shStop(piece);
  if (PL.playing()) PL.toggle();
  piece.rec = true;
  $('shRec').classList.add('recording');
  $('shRecLbl').textContent = 'Recording… say it';
  try {
    const url = await recordClip(((piece.b - piece.a) / rate + 1) * 1000);
    if (SH !== piece) return URL.revokeObjectURL(url);
    if (piece.url) URL.revokeObjectURL(piece.url);
    piece.url = url;
    P.totals.recordings = (P.totals.recordings || 0) + 1;
    P.totals.shadow = (P.totals.shadow || 0) + 1;
    const today = todayStats(P);
    today.spoken = (today.spoken || 0) + 1;
    save();
    renderShadow();
    await playUrl(url);
  } catch (e) {
    toast('sync', 'No microphone found', micHelp(), 'mic');
  } finally {
    piece.rec = false;
    $('shRec').classList.remove('recording');
    $('shRecLbl').textContent = 'Record me';
    renderShadow();
  }
}

// Moves the piece one length back (-1) or forward (1), kept inside the episode
const shMove = direction => {
  if (!SH) return;
  const length = SH.b - SH.a;
  const duration = PL.dur();
  SH.a = Math.max(0, SH.a + direction * length);
  SH.b = SH.a + length;
  if (duration && SH.b > duration) {
    SH.b = duration;
    SH.a = Math.max(0, duration - length);
  }
  renderShadow();
  shPlay();
};

$('dShadow').onclick = shadowOpen;
$('shPlay').onclick = () => shPlay();
$('shRec').onclick = shRecord;
$('shMine').onclick = () => SH?.url && playUrl(SH.url);
// The piece, then your recording
$('shBoth').onclick = async () => {
  const piece = SH;
  if (!piece?.url) return;
  if (!await shPlay() || SH !== piece) return;
  await new Promise(resolve => setTimeout(resolve, 300));
  await playUrl(piece.url);
};
$('shPrev').onclick = () => shMove(-1);
$('shNext').onclick = () => shMove(1);
$('shClose').onclick = shadowClose;

// Media keys and the system's media controls
if ('mediaSession' in navigator) {
  const mediaActions = [
    ['play', () => !PL.playing() && PL.toggle()],
    ['pause', () => PL.playing() && PL.toggle()],
    ['seekbackward', () => PL.skip(-15)],
    ['seekforward', () => PL.skip(30)],
  ];
  mediaActions.forEach(([action, handler]) => {
    try {
      navigator.mediaSession.setActionHandler(action, handler);
    } catch (e) {}
  });
}

// ---- Listen page: show grid -> episodes / videos ----
// " · 3 words to learn" after an episode, when its title and description hold app words
const wordsChip = item => {
  const count = itemWords(item).length;
  if (!count) return '';
  const hint = 'App words in this episode’s title and description: they appear in the mini player while it plays';
  return ` · <span class="wchip" title="${hint}">${count} word${count === 1 ? '' : 's'} to learn</span>`;
};

// The page's state: tab ('pod' | 'yt'), open (show id or null), err (last load error), loading (show id being loaded),
// fetched (show id already checked since it was opened), force (Refresh: check even a fresh YouTube list)
let LV = {tab: 'pod', open: null, err: '', loading: false, fetched: null};

// Draws the Listen page: the grid of shows, or the open show's episodes / videos (and starts checking its feed)
function renderListen() {
  const list = LV.tab === 'pod' ? PODCASTS : CHANNELS;
  const src = list.find(show => show.id === LV.open);
  $('lTabs').querySelectorAll('button').forEach(button => {
    button.setAttribute('aria-pressed', button.dataset.ltab === LV.tab);
  });
  $('ytWrap').hidden = !(LV.tab === 'yt' && ytOn() && !remote);
  $('ytMini').hidden = !(LV.tab === 'yt' && remote);

  if (!src) {
    $('lBody').innerHTML = showGridHtml();
    const shelf = LV.tab === 'pod' ? dlShelf() : '';
    const form = tauri ? addShowForm(LV.tab) : '';
    $('lBody').insertAdjacentHTML('beforeend', shelf + form);
    return;
  }

  checkFeed();
  const feed = savedFeed(src);
  const head = headHtml(feed);
  if (!feed) {
    $('lBody').innerHTML = head;
    return;
  }
  const playing = PL.playing();
  $('lBody').innerHTML = head + (src.feed ? episodesHtml(feed, playing) : videosHtml(feed, playing));

  function showGridHtml() {
    const button = show => {
      const isNow = NP?.src === show.id;
      const playingMark = isNow ? `<span class="eq" aria-label="Playing">${icon('headphones')}</span>` : '';
      return [
        `<button class="show${isNow ? ' now' : ''}" data-show="${show.id}">${seal(esc(show.seal), 'm', show.color)}`,
        `<span><b>${esc(show.name)}</b><small>${esc(show.level)}</small></span>${playingMark}</button>`,
      ].join('');
    };
    return `<div class="shows">${list.map(button).join('')}</div>`;
  }

  // Opened (or Refresh): get the newest episodes
  function checkFeed() {
    const kept = savedFeed(src);
    // YouTube: a list from the last 6 hours is fresh enough
    const freshVideoList = !src.feed && kept && !kept.viaPlayer && Date.now() - kept.at < 6 * 3600e3;
    if (LV.fetched !== src.id && !LV.force && freshVideoList) {
      LV.fetched = src.id;
    }
    LV.force = false;
    if (LV.fetched === src.id || LV.loading === src.id) return;
    // The state object of this check: switching tabs replaces LV, and then this check no longer draws
    const state = LV;
    state.fetched = src.id;
    state.loading = src.id;
    state.err = '';
    loadFeed(src)
      .catch(error => {
        if (state.fetched === src.id) state.err = String(error?.message || error).slice(0, 120);
      })
      .finally(() => {
        if (state.loading === src.id) state.loading = false;
        if (view === 'listen' && LV === state) renderListen();
      });
  }

  function statusHtml(feed) {
    if (LV.loading === src.id) {
      return `<span class="loading">${feed ? 'Checking for new episodes…' : 'Loading episodes…'}</span>`;
    }
    if (LV.err) {
      let advice = '';
      if (feed) {
        advice = ' Showing the last saved list.';
      } else if (src.feed) {
        advice = ' Check your internet connection.';
      }
      const failed = feed ? 'check for new episodes' : 'load this feed';
      return `Couldn’t ${failed} (${esc(LV.err)}).${advice} <button class="link" data-refresh>Try again</button>`;
    }
    if (feed) {
      return `Updated ${timeAgo(feed.at)} · <button class="link" data-refresh>Refresh</button>`;
    }
    return '';
  }

  function headHtml(feed) {
    const status = statusHtml(feed);
    const allShows = LV.tab === 'pod' ? 'podcasts' : 'channels';
    const back = `<button class="link back" data-show="">${icon('back')}All ${allShows}</button>`;
    const remove = src.mine ? '<button class="link rm-show" data-rmshow>Remove from my list</button>' : '';
    const title = [
      `<div class="show-head">${seal(esc(src.seal), 'm', src.color)}`,
      `<div><h2>${esc(src.name)}</h2><p class="muted">${esc(feed?.about || src.level)}</p></div></div>`,
    ].join('');
    return [
      back,
      `${remove}${title}`,
      `<p class="feed-status muted">${status}</p>`,
    ].join('\n    ');
  }

  function episodesHtml(feed, playing) {
    const row = (episode, index) => {
      const isNow = NP?.url === episode.url;
      const action = isNow && playing ? 'Pause' : 'Play';
      const duration = episode.dur ? ' · ' + esc(episode.dur) : '';
      return [
        `<div class="ep${isNow ? ' now' : ''}">`,
        `<button class="play-btn" data-ep="${index}" aria-label="${action}: ${esc(episode.title)}">`,
        `${icon(isNow && playing ? 'pause' : 'play')}</button>`,
        `<div><b>${esc(episode.title)}</b>`,
        `<small>${dateOf(episode.date)}${duration}${epMark(episode.url)}${wordsChip(episode)}</small></div>`,
        `${dlBtn(episode, index)}</div>`,
      ].join('');
    };
    return `<div class="eps">${feed.items.map(row).join('')}</div>`;
  }

  function videosHtml(feed, playing) {
    const card = (video, index) => {
      const isNow = NP?.id === video.id;
      const playingMark = isNow ? `<span class="eq">${icon(playing ? 'pause' : 'play')}</span>` : '';
      return [
        `<button class="vid${isNow ? ' now' : ''}" data-vid="${index}">`,
        `<span class="thumb"><img src="https://i.ytimg.com/vi/${video.id}/mqdefault.jpg" alt="" loading="lazy">`,
        `${playingMark}</span>`,
        `<b>${esc(video.title)}</b><small>${dateOf(video.date)}${wordsChip(video)}</small></button>`,
      ].join('');
    };
    return `<div class="vids">${feed.items.map(card).join('')}</div>`;
  }
}

// The "Add a podcast / channel" form
$('listen').addEventListener('submit', async event => {
  if (!event.target.matches('[data-addshow]')) return;
  event.preventDefault();
  const message = $('addShowMsg');
  const button = event.target.querySelector('button');
  message.textContent = 'Checking…';
  message.classList.remove('bad');
  button.disabled = true;
  try {
    const show = await addShow(LV.tab, $('addShowIn').value);
    LV.open = show.id;
    LV.fetched = null;
    renderListen();
    toast('sync', 'Added', show.name, 'plus');
  } catch (err) {
    message.textContent = String(err.message || err);
    message.classList.add('bad');
    button.disabled = false;
  }
});

// Every button on the Listen page (tabs, shows, episodes, videos, downloads)
$('listen').addEventListener('click', event => {
  const target = event.target;
  const openShowOfTab = () => (LV.tab === 'pod' ? PODCASTS : CHANNELS).find(show => show.id === LV.open);

  const tabButton = target.closest('[data-ltab]');
  if (tabButton) {
    LV = {tab: tabButton.dataset.ltab, open: null, err: '', loading: false};
    renderListen();
    return;
  }
  const showButton = target.closest('[data-show]');
  if (showButton) {
    LV.open = showButton.dataset.show || null;
    LV.err = '';
    LV.fetched = null;
    renderListen();
    scrollTo(0, 0);
    return;
  }
  if (target.closest('[data-refresh]')) {
    LV.fetched = null;
    LV.force = true;
    renderListen();
    return;
  }
  if (target.closest('[data-rmshow]')) {
    const show = openShowOfTab();
    if (show) removeShow(show);
    return;
  }
  const downloadedPlay = target.closest('[data-dlplay]');
  if (downloadedPlay) {
    playDownloaded(downloadedPlay.dataset.dlplay);
    return;
  }
  const downloadedDelete = target.closest('[data-dldel]');
  if (downloadedDelete) {
    const url = downloadedDelete.dataset.dldel;
    toggleDownload({url, title: DLM[url]?.title || 'this episode'});
    return;
  }

  // The buttons inside an open show
  const src = openShowOfTab();
  const feed = src && savedFeed(src);
  if (!feed) return;
  const downloadButton = target.closest('[data-dl]');
  if (downloadButton) {
    toggleDownload(feed.items[+downloadButton.dataset.dl]);
    return;
  }
  const episodeButton = target.closest('[data-ep]');
  if (episodeButton) {
    const episode = feed.items[+episodeButton.dataset.ep];
    if (NP?.url === episode.url) {
      PL.toggle();
    } else {
      playEp(src, episode);
    }
    return;
  }
  const videoButton = target.closest('[data-vid]');
  if (videoButton) {
    const video = feed.items[+videoButton.dataset.vid];
    if (NP?.id === video.id) {
      PL.toggle();
    } else {
      playVid(src, video);
    }
    $('ytWrap').hidden = !!remote || miniOpen;
    scrollTo({top: 0, behavior: 'smooth'});
  }

  // A Downloaded-shelf episode; its show may have been removed since
  function playDownloaded(url) {
    const meta = DLM[url] || {};
    if (NP?.url === url) {
      PL.toggle();
      return;
    }
    const unknownShow = {id: 'dl', name: 'Downloaded', seal: '↓', color: ''};
    const show = PODCASTS.find(podcast => podcast.id === meta.src) || unknownShow;
    playEp(show, {title: meta.title || 'Downloaded episode', url});
  }
});

// Coming back to the Listen page checks the open show again
document.querySelector('.nav-item[data-tab=listen]').addEventListener('click', () => {
  LV.fetched = null;
  renderListen();
});

// ---- Mini window and tray talk to this window through events ----
tauri?.event.listen('player-cmd', event => {
  const command = event.payload;
  if (command === 'toggle') {
    PL.toggle();
  } else if (command === 'back') {
    PL.skip(-15);
  } else if (command === 'fwd') {
    PL.skip(30);
  } else if (command === 'listen') {
    tauri.core.invoke('show_main');
    show('listen');
  } else if (command === 'duck') {
    // the mini window speaks a word
    duck();
  }
});
tauri?.event.listen('mini-ready', update);
tauri?.event.listen('mini-shown', () => {
  miniOpen = true;
  if (ytOn() && !remote) sendToMini(PL.playing(), PL.time());
  update();
});
// The mini window answers with mini-video-end
tauri?.event.listen('mini-hidden', () => {
  miniOpen = false;
});
tauri?.event.listen('mini-video-state', event => {
  const report = event.payload;
  if (!remote || NP?.id !== report.id) return;
  const changed = remote.state !== report.state;
  remote = {...report, at: Date.now()};
  if (changed) {
    refresh();
  } else {
    update();
  }
});
// The mini window closed: continue the video here from the same second
tauri?.event.listen('mini-video-end', event => {
  const report = event.payload;
  if (!remote || NP?.id !== report.id) return;
  // (this can arrive before mini-hidden)
  remote = null;
  miniOpen = false;
  resumeAt = report.t;
  if (report.playing) {
    playVid(CHANNELS.find(channel => channel.id === NP.src) || NP, NP, report.t);
  } else {
    yt?.cueVideoById?.({videoId: NP.id, startSeconds: report.t});
    remember();
    refresh();
  }
});
$('ytBack').onclick = () => tauri?.core.invoke('toggle_mini');

// Close to tray (per device, like the theme)
const trayOn = () => lsGet('tray', true);
const renderTray = () => {
  const on = trayOn();
  $('trayToggle').textContent = 'Close to tray: ' + (on ? 'on' : 'off');
  $('trayToggle').title = on
    ? 'Closing the window keeps the app (and audio) running in the tray'
    : 'Closing the window quits the app';
};
$('trayToggle').onclick = () => {
  lsSet('tray', !trayOn());
  tauri?.core.invoke('close_to_tray', {on: trayOn()});
  renderTray();
};
$('trayToggle').hidden = !tauri;
tauri?.core.invoke('close_to_tray', {on: trayOn()});
renderTray();

// Resume where you left off (paused)
{
  const saved = lsGet('np', null);
  if (saved?.kind === 'pod' && saved.url) {
    NP = saved;
    resumeAt = saved.t || 0;
    pod.src = epSrc(saved.url) + (resumeAt ? '#t=' + resumeAt : '');
    pod.playbackRate = rate;
  } else if (saved?.kind === 'yt' && saved.id) {
    NP = saved;
    resumeAt = saved.t || 0;
  }
  update();
}
