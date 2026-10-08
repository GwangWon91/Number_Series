#!/usr/bin/env bash
# 현재 브랜치를 배포까지: push → PR(없으면 생성) → CI 대기 → 병합 → 릴리스 PR 병합 → Pages 배포 확인.
# Claude Code가 이 명령 하나로 끝까지 진행한다. main 보호 규칙(check 필수)은 그대로 지킨다.
#
#   npm run ship
#
# 릴리스할 커밋(feat·fix·config·docs 등)이 없으면 병합까지만 하고 끝난다.
set -euo pipefail

say() { printf '\n▶ %s\n' "$*"; }

branch=$(git branch --show-current)
[[ $branch != main ]] || { echo "main에서는 실행하지 않는다 — 작업 브랜치에서 실행"; exit 1; }
[[ -z $(git status --porcelain) ]] || { echo "커밋하지 않은 변경이 있다"; exit 1; }

# PR 최신 커밋에 체크가 붙을 때까지 기다린 뒤 결과를 본다 (막 push한 직후엔 비어 있다)
wait_checks() {
  local pr=$1
  for _ in $(seq 60); do
    [[ $(gh pr view "${pr}" --json statusCheckRollup -q '.statusCheckRollup | length') -gt 0 ]] && break
    sleep 5
  done
  gh pr checks "${pr}" --watch --fail-fast
}

# 특정 커밋에서 돈 워크플로 실행이 끝날 때까지 기다린다 (실패면 종료)
wait_run() {
  local workflow=$1 sha=$2 id=""
  for _ in $(seq 60); do
    id=$(gh run list --workflow "$workflow" --commit "$sha" --limit 1 --json databaseId -q '.[0].databaseId')
    [[ -n $id ]] && break
    sleep 5
  done
  [[ -n $id ]] || { echo "$workflow 실행을 찾지 못함 ($sha)"; exit 1; }
  gh run watch "$id" --exit-status >/dev/null
  echo "$workflow 성공: $(gh run view "$id" --json url -q .url)"
}

say "push: $branch"
git push -u origin "$branch"

pr=$(gh pr view "$branch" --json number,state -q 'select(.state == "OPEN") | .number' 2>/dev/null || true)
if [[ -z $pr ]]; then
  say "PR 생성"
  gh pr create --base main --fill
  pr=$(gh pr view "$branch" --json number -q .number)
fi

say "PR #$pr CI 대기"
wait_checks "${pr}"

say "PR #$pr 병합"
gh pr merge "${pr}" --merge --delete-branch
git checkout main
git pull --ff-only

say "release-please 대기"
wait_run release.yml "$(git rev-parse HEAD)"

rp=$(gh pr list --label 'autorelease: pending' --json number -q '.[0].number')
if [[ -z $rp ]]; then
  say "릴리스할 변경 없음 — 병합까지만 완료"
  exit 0
fi

# 기본 토큰(GITHUB_TOKEN)이 갱신한 릴리스 PR에는 CI가 자동으로 안 돌 수 있다 → 직접 실행
if [[ $(gh pr view "${rp}" --json statusCheckRollup -q '.statusCheckRollup | length') -eq 0 ]]; then
  say "릴리스 PR #${rp}에 CI 직접 실행"
  gh workflow run ci.yml --ref "$(gh pr view "${rp}" --json headRefName -q .headRefName)"
fi
say "릴리스 PR #$rp CI 대기"
wait_checks "${rp}"

say "릴리스 PR #$rp 병합 → 태그·Release·배포"
gh pr merge "${rp}" --merge
git pull --ff-only
wait_run release.yml "$(git rev-parse HEAD)"

say "배포 완료: $(gh release view --json tagName -q .tagName) → $(gh api 'repos/{owner}/{repo}/pages' -q .html_url)"
