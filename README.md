# Bluesky Feed Examples

This is a fork/ populated version of [the example feed generator](https://github.com/bluesky-social/feed-generator)
for use as a ready-to-go implementation. It was very much vibe-coded via Claude,
so if that offends thee, so be it, but this is a small enough task that it
feels like a good fit.

## The Essential Idea (you fill in the missing parts)

Fork this or copy it to a new repository, rework one or more of the functions 
in `netlify/functions/server.ts` to search for whatever text you want to make 
a feed of on Bluesky, then 

- create an account at Netlify
- create an app at Netlify with their database
- tie it to the GitHub repository you've forked/ created whatever from this
- make sure the Netlify app publishes on pushes to the repository
- make an [app password at Bluesky](https://bsky.app/settings/app-passwords)
- write that down somewhere secure
- `yarn install`
- `cp .env.example .env`
- fill out the relevant variables
- add, commit, push
- run `yarn publishFeed` and figure out what to put where
- watch the logs for your app at Netlify to see if all went well (hint: it didn't at first)
- ???
- try your new feed