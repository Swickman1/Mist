// Adapter: a GitHub topic page, most-starred first. Each repo card becomes a row whose
// pageUrl is the repo's latest release, which Mist's GitHub resolver can install.
// Repos without a Windows build in their release fail at install with "no parts found".

/** One repo card heading: <h3> <a href="/owner">owner</a> / <a href="/owner/repo">repo</a> </h3> */
const CARD = /<h3[^>]*>[\s\S]*?<a[^>]*href="\/([\w.-]+)\/([\w.-]+)"[^>]*>([^<]+)<\/a>[\s\S]*?<\/h3>/g

export default {
  name: 'github-topic-open-source-game',
  url: 'https://github.com/topics/open-source-game',
  fixture: 'fixtures/github-topic.html',
  /** @param {string} html */
  parse(html) {
    return [...html.matchAll(CARD)].map(([, owner, repo, text]) => ({
      title: text.trim(),
      pageUrl: `https://github.com/${owner}/${repo}/releases/latest`
    }))
  }
}
