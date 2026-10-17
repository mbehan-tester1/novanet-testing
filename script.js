// This file runs directly in the browser. Start with config.json for site changes.
// The sections below cover settings, cards, content, previews, icons, and navigation.
const POSTS_PER_PAGE = 20;
const CODE_TOKEN_TYPES = [
  "keyword", "call", "property", "type", "string", "number",
  "comment", "dotAccess", "preprocessing"
];

// Missing config settings use these fallbacks; arrays such as links are replaced.
const defaultConfig = {
  site: {
    title: "Personal Website",
    description: "",
    language: "en"
  },
  profile: {
    name: "",
    handle: "@you",
    bio: "",
    photoAlt: "Profile photo",
    location: "",
    links: []
  },
  assets: {
    profilePhoto: "assets/profile.jpg"
  },
  features: {
    openmoji: true,
    postEmoji: true,
    postHandle: true,
    filterByEmoji: true,
    postHoverRotation: true,
    postHoverShadow: true
  },
  theme: {
    colorScheme: "dark",
    fontFamily: "system-ui, sans-serif",
    colors: {
      background: "#292a2b",
      backgroundDeep: "#202122",
      panel: "#343536",
      profilePanel: "#343536",
      text: "#f7f2e8",
      muted: "#a9aaa8",
      postText: "#17191b",
      accent: "#f8d66d",
      line: "rgba(255, 255, 255, 0.12)",
      controlBackground: "rgba(255, 255, 255, 0.055)",
      controlBackgroundHover: "rgba(255, 255, 255, 0.12)",
      controlText: "#f7f2e8",
      mediaOverlayBackground: "rgba(23, 25, 27, 0.82)",
      mediaOverlayText: "#f7f2e8",
      shadow: "0 24px 60px rgba(0, 0, 0, 0.28)",
      postShadow: "0 12px 0 rgba(0, 0, 0, 0.16), 0 26px 48px rgba(0, 0, 0, 0.18)",
      postHoverShadow: "0 18px 0 rgba(0, 0, 0, 0.13), 0 34px 58px rgba(0, 0, 0, 0.28)"
    },
    fontSizes: {
      base: "20px",
      baseMobile: "18px",
      feedLabel: "0.78rem",
      profileHeading: "2.2rem",
      profileHeadingMobile: "2.2rem",
      feedHeading: "clamp(2.2rem, 6vw, 4.5rem)",
      profileBody: "1.15rem",
      control: "1rem",
      small: "0.95rem",
      meta: "1rem",
      badge: "0.82rem",
      code: "0.85rem",
      postBody: "clamp(1.3rem, 2.6vw, 1.75rem)",
      postBodyLong: "clamp(1.02rem, 1.7vw, 1.22rem)",
      postEmoji: "3.15rem",
      postEmojiMobile: "2.55rem",
      linkPreviewMeta: "0.92rem",
      linkPreviewTitle: "1.05rem",
      footer: "0.9rem"
    },
    radii: {
      card: "24px",
      profilePhoto: "26px",
      emoji: "20px",
      media: "18px",
      linkPreview: "16px",
      linkPreviewImage: "12px",
      control: "999px"
    },
    postColors: []
  },
  labels: {
    latestPosts: "latest posts",
    backToFeed: "← Back to feed",
    previousPost: "← Previous",
    nextPost: "Next →",
    pinned: "Pinned",
    thread: "Thread",
    threadReplies: "Thread replies",
    threadReply: "Thread reply",
    wrapCode: "Wrap code",
    unwrapCode: "Unwrap code",
    missingPost: "That post seems to have wandered off.",
    emptyFilter: "Nothing in the feed matches that icon.",
    loadError: "Posts could not be loaded."
  }
};

// Keep individual posts for detail navigation, and grouped threads for the feed.
let siteConfig = defaultConfig;
let orderedPosts = [];
let postsById = new Map();
let threadsById = new Map();
let feedPosts = [];
let sessionColors = {};
let postColorPalette = [];
let codeResizeObserver;
const configPath = document.currentScript?.dataset.configPath || "config.json";
// Shared icons sit beside script.js, even when the page lives in demo/ or a subfolder.
const sharedAssetPath = document.currentScript?.src
  ? new URL("assets/", document.currentScript.src).href
  : "assets/";
// Keep navigation on the current page, including the alternate demo.
const pagePath = window.location.pathname.split("/").pop() || "index.html";

const postsElement = document.querySelector("#posts");
const profileElement = document.querySelector("#profile");
const footerElement = document.querySelector("#site-footer");
const titleElement = document.querySelector("#feed-title");
const searchParams = new URLSearchParams(window.location.search);
const postId = searchParams.get("post");
const detailColor = searchParams.get("color");
const iconFilter = searchParams.get("icon") || searchParams.get("emoji");
const filterReturnPage = currentFilterReturnPage();

postsElement.addEventListener("click", handlePostClick);
postsElement.addEventListener("keydown", handlePostKeydown);
window.addEventListener("resize", updateProfileHeadingSize);

loadSiteData()
  .then((data) => {
    siteConfig = data.config;
    applyConfig(siteConfig);
    orderedPosts = orderPosts(data.posts);
    buildThreads();
    postColorPalette = normalizedPostColorPalette(siteConfig);
    sessionColors = getSessionPostColors();
    render();
  })
  .catch((error) => {
    console.error(error);
    postsElement.innerHTML = `
      <article class="post post-detail" style="background: #ffb3ba; --tilt: 0deg;">
        ${emojiTemplate({ emoji: "🧐" })}
        <div class="post-content">
          <div class="handle">${escapeHtml(profileHandle())}</div>
          <p class="post-body">${escapeHtml(labelText("loadError"))}</p>
          <time class="date">${uiEmojiTemplate("🕒", "")} today</time>
        </div>
      </article>
    `;
  });

// Settings and profile
async function loadSiteData() {
  const [config, posts] = await Promise.all([
    loadJson(configPath),
    loadJson("posts.json", { required: true })
  ]);

  return {
    config: mergeConfig(defaultConfig, config),
    posts
  };
}

async function loadJson(path, options = {}) {
  const response = await fetch(path, { cache: "no-cache" });

  if (!response.ok) {
    if (options.required || response.status !== 404) {
      throw new Error(`Could not load ${path}: ${response.status}`);
    }

    return {};
  }

  return response.json();
}

// Merge nested settings so changing one colour does not remove the other defaults.
function mergeConfig(base, override) {
  if (!override || typeof override !== "object" || Array.isArray(override)) {
    return base;
  }

  const output = { ...base };

  for (const [key, value] of Object.entries(override)) {
    if (value && typeof value === "object" && !Array.isArray(value) && base[key] && typeof base[key] === "object" && !Array.isArray(base[key])) {
      output[key] = mergeConfig(base[key], value);
      continue;
    }

    output[key] = value;
  }

  return output;
}

function applyConfig(config) {
  document.documentElement.lang = config.site.language || "en";
  document.documentElement.style.colorScheme = config.theme.colorScheme || "dark";
  document.title = config.site.title || document.title;
  applyTheme(config.theme);
  applyFeatureStyles(config.features);
  renderProfile(config);
  renderFooter(config);
}

// Map the friendly JSON names to the CSS variables used in style.css.
function applyTheme(theme) {
  const root = document.documentElement;
  const colors = theme.colors || {};
  const radii = theme.radii || {};
  const fontSizes = theme.fontSizes || {};
  const variables = {
    "--bg": colors.background,
    "--bg-deep": colors.backgroundDeep,
    "--panel": colors.panel,
    "--profile-panel": colors.profilePanel,
    "--paper": colors.text,
    "--ink": colors.postText,
    "--accent": colors.accent,
    "--muted": colors.muted,
    "--line": colors.line,
    "--control-bg": colors.controlBackground,
    "--control-bg-hover": colors.controlBackgroundHover,
    "--control-text": colors.controlText,
    "--media-overlay-bg": colors.mediaOverlayBackground,
    "--media-overlay-text": colors.mediaOverlayText,
    "--shadow": colors.shadow,
    "--post-shadow": colors.postShadow,
    "--post-hover-shadow-config": colors.postHoverShadow,
    "--radius": radii.card,
    "--profile-photo-radius": radii.profilePhoto,
    "--emoji-radius": radii.emoji,
    "--media-radius": radii.media,
    "--link-preview-radius": radii.linkPreview,
    "--link-preview-image-radius": radii.linkPreviewImage,
    "--control-radius": radii.control,
    "--font-family": theme.fontFamily,
    "--font-size-base": fontSizes.base,
    "--font-size-base-mobile": fontSizes.baseMobile,
    "--font-size-feed-label": fontSizes.feedLabel,
    "--font-size-profile-heading": fontSizes.profileHeading,
    "--font-size-profile-heading-mobile": fontSizes.profileHeadingMobile,
    "--font-size-feed-heading": fontSizes.feedHeading,
    "--font-size-profile-body": fontSizes.profileBody,
    "--font-size-control": fontSizes.control,
    "--font-size-small": fontSizes.small,
    "--font-size-meta": fontSizes.meta,
    "--font-size-badge": fontSizes.badge,
    "--font-size-code": fontSizes.code,
    "--font-size-post-body": fontSizes.postBody,
    "--font-size-post-body-long": fontSizes.postBodyLong,
    "--font-size-post-emoji": fontSizes.postEmoji,
    "--font-size-post-emoji-mobile": fontSizes.postEmojiMobile,
    "--font-size-link-preview-meta": fontSizes.linkPreviewMeta,
    "--font-size-link-preview-title": fontSizes.linkPreviewTitle,
    "--font-size-footer": fontSizes.footer
  };

  for (const [name, value] of Object.entries(variables)) {
    if (value) {
      root.style.setProperty(name, value);
    }
  }
}

function applyFeatureStyles(features) {
  const root = document.documentElement;
  root.style.setProperty("--post-hover-rotation", features.postHoverRotation === false ? "0deg" : "-0.8deg");
  root.style.setProperty("--post-hover-shadow", features.postHoverShadow === false ? "var(--post-shadow)" : "var(--post-hover-shadow-config)");
}

function renderProfile(config) {
  if (!profileElement) {
    return;
  }

  const profile = config.profile;
  const photo = config.assets.profilePhoto
    ? `<img class="profile-photo" alt="${escapeHtml(profile.photoAlt || "")}" src="${escapeHtml(config.assets.profilePhoto)}">`
    : "";
  const identity = profile.handle || profile.name || "";
  const headingClass = /\s/.test(identity) ? "" : ' class="profile-heading-single-line"';
  const heading = identity
    ? `<h1${headingClass}>${escapeHtml(identity)}</h1>`
    : "";
  const bio = profile.bio ? `<p>${inlineMarkdownHtml(profile.bio)}</p>` : "";
  const details = profileDetailsTemplate(profile, config);

  const content = `${heading}${bio}${details}`;
  profileElement.classList.toggle("profile-card-with-photo", Boolean(photo));
  profileElement.innerHTML = `${photo}${content ? `<div class="profile-content">${content}</div>` : ""}`;
  updateProfileHeadingSize();
  // An external font may change the width of the same handle after rendering.
  document.fonts?.ready.then(updateProfileHeadingSize);
}

// Keep a single-word identity intact, reducing its size only when it cannot fit.
function updateProfileHeadingSize() {
  const heading = profileElement?.querySelector(".profile-heading-single-line");
  if (!heading) {
    return;
  }

  heading.style.removeProperty("font-size");
  const availableWidth = heading.clientWidth;
  const textWidth = heading.scrollWidth;
  if (availableWidth > 0 && textWidth > availableWidth) {
    const fontSize = parseFloat(getComputedStyle(heading).fontSize);
    heading.style.fontSize = `${fontSize * availableWidth / textWidth}px`;
  }
}

function profileDetailsTemplate(profile, config) {
  const rows = [];

  if (profile.location) {
    rows.push(`<div class="profile-link-row"><span>${uiEmojiTemplate("📍", "")} ${escapeHtml(profile.location)}</span></div>`);
  }

  const links = Array.isArray(profile.links) ? profile.links : [];
  const linkMarkup = links
    .filter((link) => link && link.url && link.label)
    .filter((link) => !isFeedLink(link, config))
    .map((link) => {
      const icon = link.emoji ? `${uiEmojiTemplate(link.emoji, "")} ` : "";
      return `<a href="${escapeHtml(link.url)}">${icon}${escapeHtml(link.label)}</a>`;
    })
    .join("");

  if (linkMarkup) {
    rows.push(`<div class="profile-link-row">${linkMarkup}</div>`);
  }

  return rows.length
    ? `<div class="profile-links" aria-label="Profile details">${rows.join("")}</div>`
    : "";
}

// Recognise our feeds by URL, keeping their configured labels and destinations.
function isFeedLink(link, config) {
  try {
    const url = new URL(link.url, document.baseURI);
    const bases = [document.baseURI];
    if (config.site.url) {
      bases.push(`${config.site.url.replace(/\/+$/, "")}/`);
    }
    return bases.some((base) => ["feeds/rss.xml", "feeds/feed.json"].some((path) => {
      const feedUrl = new URL(path, base);
      return url.origin === feedUrl.origin && url.pathname === feedUrl.pathname;
    }));
  } catch {
    return false;
  }
}

function renderFooter(config) {
  if (!footerElement) {
    return;
  }

  const links = Array.isArray(config.profile.links) ? config.profile.links : [];
  const feedLinks = links
    .filter((link) => link && link.url && link.label && isFeedLink(link, config))
    .map((link) => `<a href="${escapeHtml(link.url)}">${escapeHtml(link.label)}</a>`)
    .join("");
  const feeds = feedLinks
    ? `<nav class="footer-feed-links" aria-label="Feeds">${feedLinks}</nav>`
    : "";
  const attribution = config.features.openmoji
    ? `<p class="footer-attribution">Emoji artwork by <a href="https://openmoji.org/">OpenMoji</a> · <a href="https://creativecommons.org/licenses/by-sa/4.0/">CC BY-SA 4.0</a></p>`
    : "";
  footerElement.innerHTML = `${feeds}${attribution}`;
}

// Feed and detail cards share the same content templates.
function render() {
  if (postId) {
    const post = orderedPosts.find((item) => item.id === postId);
    renderSinglePost(post);
  } else {
    renderFeed();
  }

  initialiseCodeWrapping();
}

function renderFeed() {
  const visiblePosts = filteredPosts();
  const pageCount = Math.max(1, Math.ceil(visiblePosts.length / POSTS_PER_PAGE));
  const currentPage = currentFeedPage(pageCount);
  const pagePosts = visiblePosts.slice((currentPage - 1) * POSTS_PER_PAGE, currentPage * POSTS_PER_PAGE);
  const pinnedPosts = pagePosts.filter(isThreadPinned);
  const regularPosts = pagePosts.filter((post) => !isThreadPinned(post));
  const feedColors = iconFilter ? {} : postColorsForFeed(visiblePosts);
  const filterMarkup = iconFilter ? feedFilterTemplate(visiblePosts.length) : "";
  const pinnedMarkup = feedUnitTemplates(pinnedPosts, true, feedColors);
  const latestHeading = regularPosts.length
    ? `<div class="feed-heading"><p class="eyebrow">${escapeHtml(labelText("latestPosts"))}</p></div>`
    : "";
  const regularMarkup = feedUnitTemplates(regularPosts, true, feedColors);
  const emptyMarkup = iconFilter && !visiblePosts.length ? emptyFilterTemplate() : "";
  const paginationMarkup = paginationTemplate(currentPage, pageCount, visiblePosts.length);

  postsElement.innerHTML = `${filterMarkup}${pinnedMarkup}${latestHeading}${regularMarkup}${emptyMarkup}${paginationMarkup}`;
}

function renderSinglePost(post) {
  if (titleElement) {
    titleElement.textContent = siteConfig.site.title;
  }

  if (!post) {
    postsElement.innerHTML = `
      ${detailNavTemplate()}
      <article class="post" style="background: #ffb3ba; --tilt: 0deg;">
        ${emojiTemplate({ emoji: "🧐" })}
        <div class="post-content">
          <div class="handle">${escapeHtml(profileHandle())}</div>
          <p class="post-body">${escapeHtml(labelText("missingPost"))}</p>
          <time class="date">${uiEmojiTemplate("🕒", "")} today</time>
        </div>
      </article>
    `;
    return;
  }

  const rootPost = postsById.get(threadRootId(post)) || post;
  const color = detailColor || getPostColor(rootPost, orderedPosts.indexOf(rootPost));
  postsElement.innerHTML = `
    ${detailNavTemplate(post)}
    ${threadTemplate(threadPostsForPost(post), false, color, post.id)}
  `;
}

function detailNavTemplate(post) {
  if (!post) {
    return `
      <nav class="detail-nav" aria-label="Post navigation">
        <div class="detail-nav-left">
          <a class="detail-nav-link" href="${detailBackUrl()}">${escapeHtml(labelText("backToFeed"))}</a>
        </div>
      </nav>
    `;
  }

  const index = orderedPosts.indexOf(post);
  const previousPost = index > 0 ? orderedPosts[index - 1] : null;
  const nextPost = index < orderedPosts.length - 1 ? orderedPosts[index + 1] : null;
  const previousLink = previousPost
    ? `<a class="detail-nav-link" href="${postUrl(previousPost, orderedPosts.indexOf(previousPost))}">${escapeHtml(labelText("previousPost"))}</a>`
    : "";
  const nextLink = nextPost
    ? `<a class="detail-nav-link" href="${postUrl(nextPost, orderedPosts.indexOf(nextPost))}">${escapeHtml(labelText("nextPost"))}</a>`
    : "";

  return `
    <nav class="detail-nav" aria-label="Post navigation">
      <div class="detail-nav-left">
        <a class="detail-nav-link" href="${detailBackUrl()}">${escapeHtml(labelText("backToFeed"))}</a>
      </div>
      <div class="detail-nav-right">
        ${previousLink}
        ${nextLink}
      </div>
    </nav>
  `;
}

function feedUnitTemplates(posts, isLink, feedColors) {
  return posts.map((post) => {
    const threadId = threadRootId(post);
    const threadPosts = threadPostsForPost(post);
    if (threadPosts.length > 1) {
      const color = feedColors[threadId] || feedColors[post.id] || getPostColor(post, orderedPosts.indexOf(post));
      return threadTemplate(threadPosts, isLink, color);
    }

    return postTemplate(post, orderedPosts.indexOf(post), isLink, feedColors[post.id]);
  }).join("");
}

function threadTemplate(posts, isLink, color, selectedPostId = "") {
  if (posts.length <= 1) {
    const post = posts[0];
    return post ? postTemplate(post, orderedPosts.indexOf(post), isLink, color, { selectedPostId }) : "";
  }

  const rootPost = posts.find((post) => post.id === threadRootId(posts[0])) || posts[0];
  const childPosts = posts.filter((post) => post.id !== rootPost.id);
  const rootIndex = orderedPosts.indexOf(rootPost);
  const background = color || getPostColor(rootPost, rootIndex);
  const childColor = relatedPostColor(background);
  const tilt = ((rootIndex % 5) - 2) * 0.35;
  const showPostEmoji = siteConfig.features.postEmoji !== false;
  const showPostHandle = siteConfig.features.postHandle !== false;
  const className = [
    "post",
    "post-thread-card",
    isLink ? "post-link" : "post-detail",
    showPostEmoji ? "" : "post-no-emoji",
    posts.some((post) => post.pinned) ? "post-pinned" : ""
  ].filter(Boolean).join(" ");
  const postEmoji = showPostEmoji
    ? emojiTemplate(rootPost, isLink && siteConfig.features.filterByEmoji !== false)
    : "";
  const postHandle = showPostHandle
    ? `<div class="handle">${escapeHtml(profileHandle())}</div>`
    : "";
  const parentLinkAttributes = isLink
    ? `data-post-id="${escapeHtml(rootPost.id)}" data-post-color="${escapeHtml(background)}" role="link" tabindex="0" aria-label="Open thread by ${escapeHtml(profileHandle())}"`
    : selectedPostId === rootPost.id ? 'aria-current="true"' : "";
  const parentMarkup = `
    <div class="post-thread-parent-main${isLink ? " post-thread-parent-link" : ""}" ${parentLinkAttributes}>
      ${postEmoji}
      <div class="post-content">
        <div class="post-meta">
          ${postHandle}
          ${pinnedTemplate(rootPost)}
        </div>
        ${postBodyTemplate(rootPost, isLink)}
        <time class="date" datetime="${rootPost.date}">${uiEmojiTemplate("🕒", "")} ${formatPostDate(rootPost.date)}</time>
      </div>
    </div>
  `;
  const childrenMarkup = `
    <div class="post-thread-children" role="group" aria-label="${escapeHtml(labelText("threadReplies"))}">
      ${childPosts.map((post) => postTemplate(post, orderedPosts.indexOf(post), isLink, childColor, {
        embeddedChild: true,
        threadColor: background,
        selectedPostId
      })).join("")}
    </div>
  `;

  if (isLink) {
    return `
      <article
        class="${className}"
        data-post-id="${escapeHtml(rootPost.id)}"
        data-post-color="${escapeHtml(background)}"
        style="background: ${background}; --tilt: ${tilt}deg;"
      >${parentMarkup}${childrenMarkup}</article>
    `;
  }

  return `<article class="${className}" style="background: ${background}; --tilt: ${tilt}deg;">${parentMarkup}${childrenMarkup}</article>`;
}

function postTemplate(post, index, isLink, colorOverride, options = {}) {
  const background = colorOverride || (!isLink && detailColor ? detailColor : getPostColor(post, index));
  const tilt = ((index % 5) - 2) * 0.35;
  const showPostEmoji = siteConfig.features.postEmoji !== false;
  const showPostHandle = siteConfig.features.postHandle !== false;
  const className = [
    "post",
    isLink && !options.embeddedChild ? "post-link" : "post-detail",
    showPostEmoji ? "" : "post-no-emoji",
    post.pinned ? "post-pinned" : "",
    options.embeddedChild ? "post-thread-child" : "",
    options.embeddedChild && isLink ? "post-thread-child-link" : ""
  ].filter(Boolean).join(" ");
  const postEmoji = showPostEmoji
    ? options.embeddedChild
      ? threadReplyIconTemplate()
      : emojiTemplate(post, isLink && siteConfig.features.filterByEmoji !== false)
    : "";
  const postHandle = showPostHandle
    ? `<div class="handle">${escapeHtml(profileHandle())}</div>`
    : "";
  const contentMarkup = `
    <div class="post-content">
      <div class="post-meta">
        ${postHandle}
        ${pinnedTemplate(post)}
      </div>
      ${postBodyTemplate(post, isLink)}
      <time class="date" datetime="${post.date}">${uiEmojiTemplate("🕒", "")} ${formatPostDate(post.date)}</time>
    </div>
  `;
  const inner = `
    ${postEmoji}
    ${contentMarkup}
  `;

  if (isLink) {
    if (options.embeddedChild) {
      return `
        <article
          class="${className}"
          data-thread-child-post-id="${escapeHtml(post.id)}"
          data-post-color="${escapeHtml(background)}"
          data-thread-color="${escapeHtml(options.threadColor || background)}"
          role="link"
          tabindex="0"
          aria-label="Open thread reply by ${escapeHtml(profileHandle())}"
          style="background: ${background}; --tilt: ${tilt}deg;"
        >${inner}</article>
      `;
    }

    return `
      <article
        class="${className}"
        data-post-id="${escapeHtml(post.id)}"
        data-post-color="${escapeHtml(background)}"
        role="link"
        tabindex="0"
        aria-label="Open post by ${escapeHtml(profileHandle())}"
        style="background: ${background}; --tilt: ${tilt}deg;"
      >${inner}</article>
    `;
  }

  const currentAttribute = options.selectedPostId === post.id ? ' aria-current="true"' : "";
  return `<article class="${className}"${currentAttribute} style="background: ${background}; --tilt: ${tilt}deg;">${inner}</article>`;
}

function filteredPosts() {
  if (!iconFilter) {
    return feedPosts;
  }

  return feedPosts.filter((post) => threadPostsForPost(post).some((item) => postIconKey(item) === iconFilter));
}

// Group before filtering and pagination so replies stay with their parent.
function buildThreads() {
  postsById = new Map(orderedPosts.map((post) => [post.id, post]));
  threadsById = new Map();

  for (const post of orderedPosts) {
    const rootId = threadRootId(post);
    if (!threadsById.has(rootId)) {
      threadsById.set(rootId, []);
    }
    threadsById.get(rootId).push(post);
  }

  for (const posts of threadsById.values()) {
    posts.sort(threadPostSort);
  }

  feedPosts = [...threadsById.values()].map((posts) => posts[0]);
  feedPosts.sort((left, right) => Number(isThreadPinned(right)) - Number(isThreadPinned(left)));
}

function threadPostsForPost(post) {
  if (!post) {
    return [];
  }

  const rootId = threadRootId(post);
  return threadsById.get(rootId) || [post];
}

function isThreadPinned(post) {
  return threadPostsForPost(post).some((item) => item.pinned);
}

function threadRootId(post) {
  if (!post) {
    return "";
  }

  let current = post;
  const seenIds = new Set();

  while (current && parentPostId(current) && postsById.has(parentPostId(current)) && !seenIds.has(current.id)) {
    seenIds.add(current.id);
    current = postsById.get(parentPostId(current));
  }

  // Broken cyclic relationships remain standalone posts.
  return seenIds.has(current?.id) ? post.id : current?.id || post.id;
}

function parentPostId(post) {
  return typeof post?.parentId === "string" ? post.parentId : "";
}

function threadDepth(post) {
  let depth = 0;
  let current = post;
  const seenIds = new Set();

  while (current && parentPostId(current) && postsById.has(parentPostId(current)) && !seenIds.has(current.id)) {
    seenIds.add(current.id);
    current = postsById.get(parentPostId(current));
    depth += 1;
  }

  return depth;
}

function threadPostSort(left, right) {
  const depthDifference = threadDepth(left) - threadDepth(right);

  if (depthDifference !== 0) {
    return depthDifference;
  }

  return orderedPosts.indexOf(left) - orderedPosts.indexOf(right);
}

function currentFeedPage(pageCount) {
  const page = Number.parseInt(searchParams.get("page") || "1", 10);

  if (!Number.isFinite(page)) {
    return 1;
  }

  return Math.min(Math.max(page, 1), pageCount);
}

function currentFilterReturnPage() {
  const page = Number.parseInt(searchParams.get("fromPage") || "", 10);

  if (!Number.isFinite(page) || page <= 1) {
    return 1;
  }

  return page;
}

function feedFilterTemplate(count) {
  const filterIcon = iconFilter || "";
  const filterLabel = emojiLabelForIcon(filterIcon) || "icon";
  const icon = inlineIconHtml(filterIcon);
  const label = `${count} ${count === 1 ? "post" : "posts"}`;
  const clearUrl = feedPageUrl(filterReturnPage, { includeFilter: false });

  return `
    <nav class="feed-filter-nav" aria-label="Feed filter">
      <a class="feed-filter-pill" href="${clearUrl}" aria-label="Clear ${escapeHtml(filterLabel)} filter">
        <span>${icon} ${escapeHtml(label)}</span>
        <span aria-hidden="true">x</span>
      </a>
    </nav>
  `;
}

function emptyFilterTemplate() {
  return `
    <article class="post post-detail" style="background: #ffb3ba; --tilt: 0deg;">
      ${emojiTemplate({ emoji: "🧐" })}
      <div class="post-content">
        <div class="handle">${escapeHtml(profileHandle())}</div>
        <p class="post-body">${escapeHtml(labelText("emptyFilter"))}</p>
        <time class="date">${uiEmojiTemplate("🕒", "")} today</time>
      </div>
    </article>
  `;
}

function paginationTemplate(currentPage, pageCount, totalPosts) {
  if (pageCount <= 1) {
    return "";
  }

  const previousLink = currentPage > 1
    ? `<a class="feed-pagination-link" href="${feedPageUrl(currentPage - 1)}">${escapeHtml(labelText("previousPost"))}</a>`
    : `<span class="feed-pagination-link feed-pagination-link-disabled" aria-disabled="true">${escapeHtml(labelText("previousPost"))}</span>`;
  const nextLink = currentPage < pageCount
    ? `<a class="feed-pagination-link" href="${feedPageUrl(currentPage + 1)}">${escapeHtml(labelText("nextPost"))}</a>`
    : `<span class="feed-pagination-link feed-pagination-link-disabled" aria-disabled="true">${escapeHtml(labelText("nextPost"))}</span>`;
  const startPost = ((currentPage - 1) * POSTS_PER_PAGE) + 1;
  const endPost = Math.min(currentPage * POSTS_PER_PAGE, totalPosts);

  return `
    <nav class="feed-pagination" aria-label="Feed pagination">
      <div class="feed-pagination-count">
        ${startPost}-${endPost} of ${totalPosts}
      </div>
      <div class="feed-pagination-links">
        ${previousLink}
        <span class="feed-pagination-page">Page ${currentPage} of ${pageCount}</span>
        ${nextLink}
      </div>
    </nav>
  `;
}

function pinnedTemplate(post) {
  if (!post.pinned) {
    return "";
  }

  return `<span class="pinned-label">${uiEmojiTemplate("📌", "")} ${escapeHtml(labelText("pinned"))}</span>`;
}

// Content blocks and lightweight inline Markdown
function postBodyTemplate(post, isPreview) {
  const previewMode = isPreview ? feedPreviewMode(post) : "full";
  const contentBlocks = normalizedContentBlocks(post, previewMode, { isPreview });
  const previewImages = isPreview ? previewImagesForPost(post) : [];
  const previewImageSources = new Set(previewImages.map((image) => image.src));
  const hasMultipleParagraphs = countParagraphBlocks(post) > 1;
  const bodyClass = !isPreview && hasMultipleParagraphs ? "post-body post-body-long" : "post-body";
  let paragraphIndex = -1;
  let renderedImagePreview = false;
  const contentMarkup = contentBlocks.map((block) => {
    if (isTextBlock(block)) {
      paragraphIndex += 1;
    }

    if (isPreview && block.type === "image" && !previewImageSources.has(block.src)) {
      return "";
    }

    if (isPreview && previewImages.length > 1 && block.type === "image") {
      if (renderedImagePreview) {
        return "";
      }

      renderedImagePreview = true;
      return imagePreviewGalleryTemplate(previewImages);
    }

    return contentBlockTemplate(block, paragraphIndex, isPreview);
  }).join("");
  const imagePreview = isPreview && previewImages.length > 1 && !renderedImagePreview
    ? imagePreviewGalleryTemplate(previewImages)
    : "";
  const contentImagePreview = isPreview
    && previewImages.length === 1
    && !contentBlocks.some((block) => block.type === "image")
    ? imageBlockTemplate(previewImages[0], isPreview)
    : "";
  const more = isPreview && isContentClipped(post) ? `<span class="read-more">More inside</span>` : "";

  return `<div class="${bodyClass}">${contentMarkup}${imagePreview}${contentImagePreview}${more}</div>`;
}

function contentBlockTemplate(block, paragraphIndex, isPreview) {
  if (block.type === "code") {
    return codeSnippetTemplate(block);
  }

  if (block.type === "image") {
    return imageBlockTemplate(block, isPreview);
  }

  if (block.type === "video") {
    return videoBlockTemplate(block, isPreview);
  }

  if (block.type === "link") {
    return `<div class="link-previews">${linkTemplate(block)}</div>`;
  }

  const paragraphClass = [
    "post-paragraph",
    paragraphIndex > 0 ? "post-paragraph-rest" : "",
    block.type === "quote" ? "post-quote" : ""
  ].filter(Boolean).join(" ");
  return `<p class="${paragraphClass}">${paragraphTextHtml(block.text || "")}</p>`;
}

function paragraphTextHtml(value) {
  return inlineMarkdownHtml(value).replace(/\r?\n/g, "<br>");
}

// Flat inline Markdown: consume complete expressions, then render plain contents.
// Keep the grammar and fixtures in step with update-site.py and client parsers.
function inlineMarkdownHtml(value) {
  const source = String(value || "");
  let html = "";
  let text = "";
  let index = 0;
  const flushText = () => {
    html += inlineEmojiHtml(text);
    text = "";
  };

  while (index < source.length) {
    if (source[index] === "\\" && isEscapableMarkdownCharacter(source[index + 1])) {
      text += source[index + 1];
      index += 2;
      continue;
    }

    const image = source[index] === "!" && source[index + 1] === "[";
    let expression;
    if (image || source[index] === "[") {
      expression = parseMarkdownLink(source, index + (image ? 1 : 0));
    } else if (source[index] === "`" || source[index] === "*") {
      expression = parseMarkdownDelimited(source, index, source[index]);
    }

    if (!expression) {
      text += source[index++];
      continue;
    }
    if (image || expression.type === "text") {
      text += image ? source.slice(index, expression.endIndex) : expression.text;
    } else {
      flushText();
      if (expression.type === "code") {
        html += `<code>${escapeHtml(expression.text)}</code>`;
      } else if (expression.type === "emphasis") {
        html += `<em>${inlineEmojiHtml(expression.text)}</em>`;
      } else {
        const target = /^https?:\/\//i.test(expression.href) ? ' target="_blank" rel="noopener noreferrer"' : "";
        html += `<a href="${escapeHtml(expression.href)}"${target}>${inlineEmojiHtml(expression.text)}</a>`;
      }
    }
    index = expression.endIndex;
  }
  flushText();
  return html;
}

function literalMarkdownExpression(source, start, endIndex) {
  return { type: "text", text: source.slice(start, endIndex), endIndex };
}

function markdownDelimiterEnd(source, start, marker) {
  let end = start;
  while (source[end] === marker) end += 1;
  return end;
}

function parseMarkdownDelimited(source, start, marker) {
  const openingEnd = markdownDelimiterEnd(source, start, marker);
  const width = openingEnd - start;
  let index = openingEnd;
  let text = "";
  let valid = width === 1;
  while (index < source.length && !isMarkdownLineEnd(source[index])) {
    const character = source[index];
    if (marker === "*" && character === "\\" && isEscapableMarkdownCharacter(source[index + 1])) {
      text += source[index + 1];
      index += 2;
    } else if (character === marker) {
      const end = markdownDelimiterEnd(source, index, marker);
      if (end - index === width) {
        valid = valid && text.length > 0 && (marker === "`" || (
          !isMarkdownWhitespace(text[0]) && !isMarkdownWhitespace(text[text.length - 1])
        ));
        return valid
          ? { type: marker === "`" ? "code" : "emphasis", text, endIndex: end }
          : literalMarkdownExpression(source, start, end);
      }
      valid = false;
      text += source.slice(index, end);
      index = end;
    } else if (marker === "*" && (character === "`" || character === "[")) {
      // An inner expression is opaque, including any stars it contains.
      const inner = character === "`"
        ? parseMarkdownDelimited(source, index, "`")
        : parseMarkdownLink(source, index);
      valid = false;
      text += source.slice(index, inner.endIndex);
      index = inner.endIndex;
    } else {
      text += character;
      index += 1;
    }
  }
  return literalMarkdownExpression(source, start, index);
}

function readMarkdownBrackets(source, start, open, close) {
  let index = start + 1;
  let depth = 1;
  let text = "";
  let nested = false;
  while (index < source.length && !isMarkdownLineEnd(source[index])) {
    const character = source[index++];
    if (character === "\\" && isEscapableMarkdownCharacter(source[index])) {
      text += source[index++];
      continue;
    }
    if (character === open) {
      depth += 1;
      nested = true;
    } else if (character === close && --depth === 0) {
      return { text, nested, closed: true, endIndex: index };
    }
    text += character;
  }
  return { text, nested, closed: false, endIndex: index };
}

function parseMarkdownLink(source, start) {
  const label = readMarkdownBrackets(source, start, "[", "]");
  if (!label.closed || source[label.endIndex] !== "(") {
    return literalMarkdownExpression(source, start, label.endIndex);
  }
  const destination = readMarkdownBrackets(source, label.endIndex, "(", ")");
  const href = destination.text.replace(/^[\t-\r ]+|[\t-\r ]+$/g, "");
  if (!destination.closed || label.nested || !label.text.replace(/[\t-\r ]/g, "")
      || /[\t-\r ]/.test(href) || !isSafeMarkdownHref(href)) {
    return literalMarkdownExpression(source, start, destination.endIndex);
  }
  return { type: "link", text: label.text, href, endIndex: destination.endIndex };
}

function isSafeMarkdownHref(value) {
  return /^(https?:\/\/|mailto:|\/(?!\/)|#)/i.test(value || "");
}

function isEscapableMarkdownCharacter(value) {
  return ["*", "`", "[", "]", "(", ")", "\\"].includes(value);
}

function isMarkdownWhitespace(value) {
  return ["\t", "\n", "\v", "\f", "\r", " "].includes(value);
}

function isMarkdownLineEnd(value) {
  return value === "\n" || value === "\r";
}

function codeSnippetTemplate(snippet) {
  const language = snippet.language || "";
  const label = escapeHtml(snippet.label || language || "Code");
  const languageData = language ? ` data-language="${escapeHtml(language)}"` : "";
  const languageClass = language ? ` class="language-${escapeHtml(language)}"` : "";
  const content = codeContentHtml(snippet);

  return `
    <figure class="post-code"${languageData}>
      <figcaption class="post-code-header">
        <span class="post-code-label">${label}</span>
        <button class="post-code-wrap-toggle" type="button" data-code-wrap hidden
          aria-label="${escapeHtml(labelText("wrapCode"))}" aria-pressed="false"
          title="${escapeHtml(labelText("wrapCode"))}">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor"
            stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M3 5h18M3 10h14a4 4 0 0 1 0 8h-4m3-3-3 3 3 3M3 15h5M3 20h5" />
          </svg>
        </button>
      </figcaption>
      <pre><code${languageClass}>${content}</code></pre>
    </figure>
  `;
}

// Measure unwrapped code so the toggle remains available while wrapping is on.
function updateCodeWrapControl(snippet) {
  const pre = snippet.querySelector("pre");
  const button = snippet.querySelector("[data-code-wrap]");
  const wasWrapped = snippet.classList.contains("post-code-wrapped");
  snippet.classList.remove("post-code-wrapped");
  const overflows = pre.clientWidth > 0 && pre.scrollWidth > pre.clientWidth + 1;
  const wrapped = wasWrapped && overflows;
  snippet.classList.toggle("post-code-wrapped", wrapped);
  button.hidden = !overflows;
  button.setAttribute("aria-pressed", String(wrapped));
  button.title = labelText(wrapped ? "unwrapCode" : "wrapCode");
}

function initialiseCodeWrapping() {
  codeResizeObserver?.disconnect();
  const snippets = postsElement.querySelectorAll(".post-code");
  snippets.forEach(updateCodeWrapControl);

  if (typeof ResizeObserver === "function") {
    const widths = new WeakMap();
    codeResizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (widths.get(entry.target) !== entry.contentRect.width) {
          widths.set(entry.target, entry.contentRect.width);
          updateCodeWrapControl(entry.target);
        }
      }
    });
    snippets.forEach((snippet) => codeResizeObserver.observe(snippet));
  }

  // Font loading can change line lengths even when the container stays the same size.
  document.fonts?.ready.then(() => {
    postsElement.querySelectorAll(".post-code").forEach(updateCodeWrapControl);
  });
}

// Posting tools prepare tokens; NovaNet only validates and displays them.
function codeContentHtml(snippet) {
  const code = String(snippet.code || "");
  const tokens = snippet.tokens;
  const validTokens = Array.isArray(tokens) && tokens.length > 0 && tokens.every((token) => (
    token && typeof token === "object" && !Array.isArray(token)
    && typeof token.text === "string"
    && (token.type === undefined || CODE_TOKEN_TYPES.includes(token.type))
  ));

  // Ignore stale or malformed highlighting without changing the code itself.
  if (!validTokens || tokens.map((token) => token.text).join("") !== code) {
    return escapeHtml(code);
  }

  return tokens.map((token) => token.type
    ? `<span class="${token.type}">${escapeHtml(token.text)}</span>`
    : escapeHtml(token.text)
  ).join("");
}

function imageBlockTemplate(image, isPreview) {
  const src = escapeHtml(image.src || "");
  const alt = escapeHtml(image.alt || "");
  const imageMarkup = `<img class="post-content-image" src="${src}" alt="${alt}" loading="lazy">`;

  if (isPreview || !src) {
    return imageMarkup;
  }

  return `<a class="post-content-image-link" href="${src}">${imageMarkup}</a>`;
}

function imagePreviewGalleryTemplate(images) {
  const visibleImages = images.slice(0, 4);
  const extraCount = images.length > 4 ? images.length - 3 : 0;
  const imageMarkup = visibleImages.map((image, index) => {
    const more = index === 3 && extraCount > 0
      ? `
        <span class="post-image-preview-more" aria-label="${extraCount} more image${extraCount === 1 ? "" : "s"}">
          +${extraCount}
        </span>
      `
      : "";

    return `
      <span class="post-image-preview-item">
        <img src="${escapeHtml(image.src || "")}" alt="${escapeHtml(image.alt || "")}" loading="lazy">
        ${more}
      </span>
    `;
  }).join("");

  return `<div class="post-image-preview-grid post-image-preview-count-${Math.min(images.length, 4)}">${imageMarkup}</div>`;
}

function videoBlockTemplate(video, isPreview) {
  return `<div class="post-content-video">${videoTemplate(video, isPreview)}</div>`;
}

// Feed previews keep long posts compact; detail views show every content block.
function normalizedContentBlocks(post, previewMode = "full", options = {}) {
  const blocks = normalizeContentBlocks(post.content);

  if (previewMode === "summary" || previewMode === "first-paragraph") {
    return firstParagraphPreviewBlocks(post, blocks, options);
  }

  if (options.isPreview && previewCodePolicy(post) === "none") {
    return blocks.filter((block) => block.type !== "code");
  }

  return blocks;
}

function feedPreviewMode(post) {
  const blocks = normalizeContentBlocks(post.content);
  return feedPreviewModeForContent(blocks);
}

function feedPreviewModeForContent(blocks) {
  const paragraphCount = blocks.filter(isTextBlock).length;
  const nonParagraphBlocks = blocks.filter((block) => !isTextBlock(block));
  const nonParagraphTypes = new Set(nonParagraphBlocks.map((block) => block.type));
  const mediaTypes = new Set(["image", "video"]);
  const hasOnlyOneMediaType = nonParagraphTypes.size === 1
    && mediaTypes.has([...nonParagraphTypes][0]);

  if (blocks.length === 1) {
    return "full";
  }

  if (!nonParagraphBlocks.length) {
    return paragraphCount > 1 ? "first-paragraph" : "full";
  }

  if (paragraphCount === 1 && hasOnlyOneMediaType) {
    return "full";
  }

  if (paragraphCount > 1 && nonParagraphBlocks.length === 1 && hasOnlyOneMediaType) {
    return "first-paragraph";
  }

  if (paragraphCount === 1 && blocks.length === 2 && nonParagraphTypes.size === 1 && nonParagraphTypes.has("code")) {
    return "full";
  }

  if (paragraphCount === 1 && nonParagraphTypes.size === 1 && nonParagraphTypes.has("link")) {
    return "full";
  }

  return "summary";
}

function firstParagraphPreviewBlocks(post, blocks, options = {}) {
  const firstParagraph = blocks.find(isTextBlock);
  const previewBlocks = firstParagraph ? [firstParagraph] : [];
  return withPreviewCodeBlock(post, blocks, previewBlocks, options);
}

function withPreviewCodeBlock(post, blocks, previewBlocks, options = {}) {
  if (!options.isPreview || previewCodePolicy(post) !== "single") {
    return previewBlocks;
  }

  const codeBlocks = blocks.filter((block) => block.type === "code");

  if (codeBlocks.length !== 1 || previewBlocks.includes(codeBlocks[0])) {
    return previewBlocks;
  }

  return [...previewBlocks, codeBlocks[0]];
}

// Copy only fields the renderer understands, with a few defaults for optional data.
function normalizeContentBlocks(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((block) => {
    if (!block || typeof block !== "object") {
      return [];
    }

    if (isTextBlock(block)) {
      return [{ type: block.type, text: String(block.text || "") }];
    }

    if (block.type === "code") {
      return [{
        type: "code",
        language: block.language || "",
        label: block.label,
        code: block.code || "",
        tokens: block.tokens
      }];
    }

    if (block.type === "image") {
      return [{
        type: "image",
        src: block.src || "",
        alt: block.alt || ""
      }];
    }

    if (block.type === "video") {
      return [{
        type: "video",
        src: block.src || "",
        alt: block.alt || "",
        typeHint: block.typeHint || "",
        poster: block.poster || ""
      }];
    }

    if (block.type === "link") {
      return [{
        type: "link",
        url: block.url || "",
        title: block.title,
        description: block.description,
        site: block.site,
        image: block.image
      }];
    }

    return [];
  });
}

function imagesForPost(post) {
  return normalizeContentBlocks(post.content)
    .filter((block) => block.type === "image" && block.src);
}

function previewImagesForPost(post) {
  const images = imagesForPost(post);
  const policy = previewImagePolicy(post);

  if (policy === "none") {
    return [];
  }

  if (policy === "all") {
    return images;
  }

  return images.slice(0, 1);
}

function previewImagePolicy(post) {
  const explicitPolicy = post && typeof post.previewImages === "string"
    ? post.previewImages.toLowerCase()
    : "";

  if (["none", "first", "all"].includes(explicitPolicy)) {
    return explicitPolicy;
  }

  const blocks = normalizeContentBlocks(post?.content);
  const imageCount = blocks.filter((block) => block.type === "image").length;
  const textCount = blocks.filter(isTextBlock).length;
  const hasOnlyTextAndImages = blocks.every((block) => isTextBlock(block) || block.type === "image");

  if (imageCount > 1 && hasOnlyTextAndImages && textCount <= 1) {
    return "all";
  }

  return "first";
}

function previewCodePolicy(post) {
  if (post && post.previewCode === false) {
    return "none";
  }

  const explicitPolicy = post && typeof post.previewCode === "string"
    ? post.previewCode.toLowerCase()
    : "";

  if (["none", "single"].includes(explicitPolicy)) {
    return explicitPolicy;
  }

  return "single";
}

function countParagraphBlocks(post) {
  return normalizeContentBlocks(post.content)
    .filter(isTextBlock).length;
}

function isTextBlock(block) {
  return block && (block.type === "paragraph" || block.type === "quote");
}

function isContentClipped(post) {
  if (feedPreviewMode(post) !== "full") {
    return true;
  }

  return previewCodePolicy(post) === "none"
    && normalizeContentBlocks(post.content).some((block) => block.type === "code");
}

function videoTemplate(video, isPreview) {
  const poster = video.poster || "";
  const posterAttribute = poster ? ` poster="${escapeHtml(poster)}"` : "";

  if (isPreview) {
    if (!poster) {
      return `<div class="video-placeholder">Video</div>`;
    }

    return `
      <span class="video-preview">
        <img src="${escapeHtml(poster)}" alt="${escapeHtml(video.alt || "Video preview")}" loading="lazy">
        <span class="play-badge" aria-label="Play video"></span>
      </span>
    `;
  }

  return `
    <video class="post-video" controls preload="metadata"${posterAttribute}>
      <source src="${escapeHtml(video.src)}" type="${escapeHtml(video.typeHint || video.type || typeForVideo(video.src))}">
    </video>
  `;
}

function linkTemplate(link) {
  const hasImage = Boolean(link.image);
  const className = `link-preview${hasImage ? "" : " link-preview-no-image"}`;
  const image = link.image
    ? `<img class="link-preview-image" src="${escapeHtml(link.image)}" alt="">`
    : "";
  const content = `
    ${image}
    <span class="link-preview-copy">
      <span class="link-preview-site">${escapeHtml(link.site || new URL(link.url).hostname)}</span>
      <span class="link-preview-title">${escapeHtml(link.title || link.url)}</span>
      <span class="link-preview-description">${escapeHtml(link.description || "")}</span>
    </span>
  `;

  return `<a class="${className}" href="${escapeHtml(link.url)}" target="_blank" rel="noopener noreferrer">${content}</a>`;
}

// Emoji artwork is local; switching OpenMoji off uses the browser's own emoji.
function emojiTemplate(post, isFilterable = false) {
  const iconKey = postIconKey(post);
  const filename = useOpenMoji() ? openMojiFilename(iconKey) : "";
  const label = emojiLabelForIcon(iconKey);
  const escapedLabel = escapeHtml(label || "");
  const iconMarkup = filename
    ? `<img src="${escapeHtml(sharedAssetPath)}openmoji/${filename}.svg" alt="">`
    : escapeHtml(iconKey);

  if (isFilterable) {
    return `
      <button
        class="post-emoji emoji-filter-button"
        type="button"
        data-icon-filter="${escapeHtml(iconKey)}"
        aria-label="Filter posts by ${escapedLabel || "this icon"}"
      >${iconMarkup}</button>
    `;
  }

  return `
    <div class="post-emoji">
      ${filename ? `<img src="${escapeHtml(sharedAssetPath)}openmoji/${filename}.svg" alt="${escapedLabel}">` : escapeHtml(iconKey)}
    </div>
  `;
}

function threadReplyIconTemplate() {
  const icon = "🧵";
  const filename = useOpenMoji() ? openMojiFilename(icon) : "";
  const iconMarkup = filename
    ? `<img src="${escapeHtml(sharedAssetPath)}openmoji/${filename}.svg" alt="">`
    : escapeHtml(icon);

  return `
    <div class="post-emoji post-thread-reply-icon" role="img" aria-label="${escapeHtml(labelText("threadReply"))}">
      ${iconMarkup}
    </div>
  `;
}

function postIconKey(post) {
  return post.emoji || "";
}

function uiEmojiTemplate(emoji, alt) {
  if (!useOpenMoji()) {
    return `<span class="ui-emoji" aria-hidden="${alt ? "false" : "true"}">${escapeHtml(emoji)}</span>`;
  }

  const filename = openMojiFilename(emoji);
  return `<img class="ui-emoji" src="${escapeHtml(sharedAssetPath)}openmoji/${filename}.svg" alt="${alt}">`;
}

function openMojiFilename(value) {
  if (!value) {
    return "";
  }

  if (/^[0-9A-F]+(?:-[0-9A-F]+)*$/i.test(value)) {
    return value.toUpperCase();
  }

  return isEmojiSegment(String(value)) ? toOpenMojiHexcode(value) : "";
}

function emojiLabelForIcon(value) {
  // A Unicode emoji can label itself; a hex filename cannot.
  return /^[0-9A-F]+(?:-[0-9A-F]+)*$/i.test(value || "") ? "" : String(value || "");
}

function inlineEmojiHtml(value) {
  if (!useOpenMoji()) {
    return escapeHtml(value);
  }

  let emojiRun = "";
  let html = "";

  for (const segment of graphemeSegments(value)) {
    if (!isEmojiSegment(segment)) {
      html += flushInlineEmojiRun(emojiRun);
      emojiRun = "";
      html += escapeHtml(segment);
      continue;
    }

    const filename = openMojiFilename(segment);

    if (!filename) {
      html += flushInlineEmojiRun(emojiRun);
      emojiRun = "";
      html += escapeHtml(segment);
      continue;
    }

    const alt = escapeHtml(segment);
    emojiRun += `<img class="inline-emoji" src="${escapeHtml(sharedAssetPath)}openmoji/${filename}.svg" alt="${alt}">`;
  }

  return html + flushInlineEmojiRun(emojiRun);
}

function flushInlineEmojiRun(value) {
  return value ? `<span class="inline-emoji-run">${value}</span>` : "";
}

function inlineIconHtml(value) {
  if (!useOpenMoji()) {
    return inlineEmojiHtml(value);
  }

  const filename = openMojiFilename(value);

  if (filename) {
    return `<img class="inline-emoji" src="${escapeHtml(sharedAssetPath)}openmoji/${filename}.svg" alt="${escapeHtml(value)}">`;
  }

  return inlineEmojiHtml(value);
}

function graphemeSegments(value) {
  // Keep joined emoji and skin tones together when the browser supports it.
  if (typeof Intl !== "undefined" && Intl.Segmenter) {
    const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
    return [...segmenter.segment(String(value))].map((item) => item.segment);
  }

  return [...String(value)];
}

function isEmojiSegment(segment) {
  return (
    /\p{Extended_Pictographic}/u.test(segment) ||
    /\p{Regional_Indicator}{2}/u.test(segment) ||
    /^[0-9#*]\uFE0F?\u20E3$/u.test(segment)
  );
}

function toOpenMojiHexcode(emoji) {
  return [...emoji]
    .map((character) => character.codePointAt(0).toString(16).toUpperCase())
    .filter((codepoint) => codepoint !== "FE0F")
    .join("-");
}

// Dates, labels, and session colours
function formatPostDate(dateString) {
  const today = startOfDay(new Date());
  const postDate = startOfDay(new Date(`${dateString}T12:00:00`));
  const diffDays = Math.round((today - postDate) / 86400000);

  if (diffDays === 0) {
    return "today";
  }

  if (diffDays < 0) {
    return formattedDate(postDate);
  }

  if (diffDays < 7) {
    return `${diffDays} ${diffDays === 1 ? "day" : "days"} ago`;
  }

  return formattedDate(postDate);
}

function formattedDate(date) {
  return date.toLocaleDateString(siteConfig.site.language || "en", {
    day: "numeric",
    month: "short",
    year: "numeric"
  });
}

function profileHandle() {
  return siteConfig.profile.handle || siteConfig.profile.name || "";
}

function labelText(key) {
  return siteConfig.labels?.[key] || defaultConfig.labels[key] || "";
}

function useOpenMoji() {
  return siteConfig.features?.openmoji !== false;
}

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function orderPosts(items) {
  // The file supplies the order. Only pinned posts move to the front.
  return [...items].sort((left, right) => Number(Boolean(right.pinned)) - Number(Boolean(left.pinned)));
}

function getSessionPostColors() {
  // Remember colours while browsing so a post keeps its colour in detail views.
  if (postColorPalette.length < 2) {
    return {};
  }

  const stored = readSessionJson("post-colors");
  const storageKey = JSON.stringify(postColorPalette);
  const palette = stored?.key === storageKey && Array.isArray(stored?.palette) && stored.palette.length === postColorPalette.length
    ? stored.palette
    : shuffle([...postColorPalette]);
  const colors = stored?.colors && typeof stored.colors === "object" ? stored.colors : {};

  for (const [index, post] of orderedPosts.entries()) {
    if (!colors[post.id]) {
      colors[post.id] = palette[index % palette.length];
    }
  }

  writeSessionJson("post-colors", { key: storageKey, palette, colors });
  return colors;
}

function getPostColor(post, index) {
  if (post && postsById.has(threadRootId(post))) {
    post = postsById.get(threadRootId(post));
    index = orderedPosts.indexOf(post);
  }

  if (!postColorPalette.length) {
    return "#f8d66d";
  }

  if (postColorPalette.length === 1) {
    return postColorPalette[0];
  }

  if (!post) {
    return postColorPalette[(index >= 0 ? index : 0) % postColorPalette.length];
  }

  return sessionColors[post.id] || postColorPalette[(index >= 0 ? index : 0) % postColorPalette.length];
}

function postColorsForFeed(feedPosts) {
  const colors = {};
  let previousColor = "";

  for (const post of feedPosts) {
    const index = orderedPosts.indexOf(post);
    const baseColor = getPostColor(post, index);
    const color = baseColor === previousColor
      ? nextPostColor(baseColor, index)
      : baseColor;

    colors[post.id] = color;
    previousColor = color;
  }

  return colors;
}

function relatedPostColor(color) {
  const hex = normalizeHexColor(color);

  if (!hex) {
    return "rgba(255, 255, 255, 0.42)";
  }

  const channels = [
    Number.parseInt(hex.slice(0, 2), 16),
    Number.parseInt(hex.slice(2, 4), 16),
    Number.parseInt(hex.slice(4, 6), 16)
  ];
  const mixed = channels.map((channel) => Math.round(channel * 0.86 + 255 * 0.14));
  return `rgb(${mixed.join(", ")})`;
}

function normalizeHexColor(value) {
  const match = String(value || "").trim().match(/^#?([0-9a-f]{3}|[0-9a-f]{6})$/i);

  if (!match) {
    return "";
  }

  const hex = match[1];
  return hex.length === 3
    ? hex.split("").map((character) => character + character).join("").toLowerCase()
    : hex.toLowerCase();
}

function nextPostColor(currentColor, index) {
  if (postColorPalette.length < 2) {
    return currentColor;
  }

  const startIndex = Math.max(index, 0) + 1;

  for (let offset = 0; offset < postColorPalette.length; offset += 1) {
    const color = postColorPalette[(startIndex + offset) % postColorPalette.length];

    if (color !== currentColor) {
      return color;
    }
  }

  return currentColor;
}

function normalizedPostColorPalette(config) {
  return Array.isArray(config.theme?.postColors)
    ? config.theme.postColors.filter((color) => typeof color === "string" && color.trim()).map((color) => color.trim())
    : [];
}

function shuffle(items) {
  for (let index = items.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [items[index], items[swapIndex]] = [items[swapIndex], items[index]];
  }

  return items;
}

function typeForVideo(src) {
  if (src.toLowerCase().endsWith(".webm")) {
    return "video/webm";
  }

  if (src.toLowerCase().endsWith(".mov")) {
    return "video/quicktime";
  }

  return "video/mp4";
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Card navigation leaves buttons, links, and media controls to handle themselves.
function handlePostClick(event) {
  const wrapButton = event.target.closest("[data-code-wrap]");

  if (wrapButton) {
    event.preventDefault();
    const snippet = wrapButton.closest(".post-code");
    snippet.classList.toggle("post-code-wrapped");
    updateCodeWrapControl(snippet);
    return;
  }

  const filterButton = event.target.closest("[data-icon-filter]");

  if (filterButton && siteConfig.features.filterByEmoji !== false) {
    event.preventDefault();
    event.stopPropagation();
    filterFeedByIcon(filterButton.dataset.iconFilter);
    return;
  }

  const postLink = postLinkFromTarget(event.target);
  if (postLink) {
    openPostLink(postLink);
  }
}

function handlePostKeydown(event) {
  if (event.key !== "Enter" && event.key !== " ") {
    return;
  }

  const postLink = postLinkFromTarget(event.target);
  if (!postLink) {
    return;
  }

  event.preventDefault();
  openPostLink(postLink);
}

function postLinkFromTarget(target) {
  if (target.closest("a, button, input, select, textarea, video, audio")) {
    return null;
  }

  // closest() picks the reply before the surrounding thread card.
  return target.closest("[data-thread-child-post-id], [data-post-id]");
}

function openPostLink(postLink) {
  if (postLink.dataset.threadChildPostId !== undefined) {
    openPost(postLink.dataset.threadChildPostId, postLink.dataset.threadColor);
  } else {
    openPost(postLink.dataset.postId, postLink.dataset.postColor);
  }
}

function openPost(postId, colorOverride) {
  if (!postId) {
    return;
  }

  const post = orderedPosts.find((item) => item.id === postId);
  const index = orderedPosts.indexOf(post);

  window.location.href = postUrl(post || { id: postId }, index, colorOverride);
}

function filterFeedByIcon(icon) {
  if (!icon) {
    return;
  }

  const params = new URLSearchParams({ icon });
  const page = Number.parseInt(searchParams.get("page") || "1", 10);

  if (Number.isFinite(page) && page > 1) {
    params.set("fromPage", String(page));
  } else if (filterReturnPage > 1) {
    params.set("fromPage", String(filterReturnPage));
  }

  window.location.href = `${pagePath}?${params.toString()}`;
}

function feedPageUrl(page, options = {}) {
  const includeFilter = options.includeFilter !== false;
  const params = new URLSearchParams();

  if (includeFilter && iconFilter) {
    params.set("icon", iconFilter);
  }

  if (includeFilter && filterReturnPage > 1) {
    params.set("fromPage", String(filterReturnPage));
  }

  if (page > 1) {
    params.set("page", String(page));
  }

  const query = params.toString();
  return query ? `${pagePath}?${query}` : pagePath;
}

function detailBackUrl() {
  const page = Number.parseInt(searchParams.get("page") || "1", 10);
  return feedPageUrl(Number.isFinite(page) ? page : 1);
}

function postUrl(post, index, colorOverride) {
  const params = new URLSearchParams({ post: post.id });
  const currentPost = postsById.get(postId);
  const sameThread = currentPost && threadRootId(currentPost) === threadRootId(post);
  const color = colorOverride || (sameThread && detailColor) || getPostColor(post, index);
  const page = Number.parseInt(searchParams.get("page") || "1", 10);

  if (color) {
    params.set("color", color);
  }

  if (iconFilter) {
    params.set("icon", iconFilter);
  }

  if (filterReturnPage > 1) {
    params.set("fromPage", String(filterReturnPage));
  }

  if (Number.isFinite(page) && page > 1) {
    params.set("page", String(page));
  }

  return `${pagePath}?${params.toString()}`;
}

function readSessionJson(key) {
  try {
    return JSON.parse(window.sessionStorage.getItem(key) || "null");
  } catch {
    return null;
  }
}

function writeSessionJson(key, value) {
  try {
    window.sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore storage failures and fall back to in-memory behavior.
  }
}
