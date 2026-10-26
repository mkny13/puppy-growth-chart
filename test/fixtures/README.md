# Test Fixtures

`test/fixtures/github-contents-get.json` is recorded from GitHub's documented "Get repository content" (file) REST API response schema (`GET /repos/{owner}/{repo}/contents/{path}`): https://docs.github.com/en/rest/repos/contents#get-repository-content

It reflects all 12 documented top-level fields returned for a file resource (`type`, `encoding`, `size`, `name`, `path`, `content`, `sha`, `url`, `git_url`, `html_url`, `download_url`, `_links`).
