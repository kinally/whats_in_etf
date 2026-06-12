#!/usr/bin/env bash
# push_to_github.sh — 通过 GitHub API 推送文件

set -e

REPO="kinally/whats_in_etf"
BRANCH="main"
TOKEN="$GH_TOKEN"

if [ -z "$TOKEN" ]; then
  echo "❌ 需要设置 GH_TOKEN 环境变量 (GitHub Personal Access Token)"
  exit 1
fi

cd "$(dirname "$0")"

echo "📦 读取所有文件..."
declare -A FILES
FILES["index.html"]="text/html; charset=utf-8"
FILES["style.css"]="text/css; charset=utf-8"
FILES["app.js"]="application/javascript; charset=utf-8"
FILES["data/latest.js"]="application/javascript; charset=utf-8"
FILES["worker.js"]="application/javascript; charset=utf-8"
FILES["README.md"]="text/markdown; charset=utf-8"

# 构建 blobs
echo "🔨 构建 blobs..."
BLOBS_JSON="[]"
for file in "${!FILES[@]}"; do
  content=$(base64 -w0 "$file" 2>/dev/null || base64 -b0 "$file" 2>/dev/null || python3 -c "import base64; print(base64.b64encode(open('$file','rb').read()).decode())")
  blob=$(curl -s -X POST "https://api.github.com/repos/$REPO/git/blobs" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"content\":\"$content\",\"encoding\":\"base64\"}")
  sha=$(echo "$blob" | python3 -c "import sys,json;print(json.load(sys.stdin)['sha'])")
  entry="{\"path\":\"$file\",\"mode\":\"100644\",\"type\":\"blob\",\"sha\":\"$sha\"}"
  BLOBS_JSON=$(echo "$BLOBS_JSON" | python3 -c "import sys,json;d=json.load(sys.stdin);d.append($entry);print(json.dumps(d))")
  echo "  ✅ $file -> $sha"
done

# 获取最新 commit
echo "🔍 获取最新 commit..."
LATEST_COMMIT=$(curl -s "https://api.github.com/repos/$REPO/git/refs/heads/$BRANCH" \
  -H "Authorization: Bearer $TOKEN" 2>/dev/null || echo "null")

if [ "$LATEST_COMMIT" = "null" ] || [ -z "$(echo "$LATEST_COMMIT" | python3 -c "import sys,json;d=json.load(sys.stdin);print(d.get('object',{}).get('sha',''))") ]; then
  echo "  🌱 仓库为空，创建初始提交..."
  BASE_TREE=""
  PARENT=""
else
  BASE_TREE_SHA=$(echo "$LATEST_COMMIT" | python3 -c "import sys,json;d=json.load(sys.stdin);print(d['object']['sha'])")
  BASE_TREE=$(curl -s "https://api.github.com/repos/$REPO/git/commits/$BASE_TREE_SHA" \
    -H "Authorization: Bearer $TOKEN" | python3 -c "import sys,json;print(json.load(sys.stdin)['tree']['sha'])")
  PARENT=",\"parents\":[\"$BASE_TREE_SHA\"]"
  echo "  📋 基于 commit $BASE_TREE_SHA"
fi

# 创建 tree
echo "🌳 创建 tree..."
TREE_JSON=$(curl -s -X POST "https://api.github.com/repos/$REPO/git/trees" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"base_tree\":${BASE_TREE:+\"$BASE_TREE\"}${BASE_TREE:+,}\"tree\":$BLOBS_JSON}")
TREE_SHA=$(echo "$TREE_JSON" | python3 -c "import sys,json;print(json.load(sys.stdin)['sha'])")
echo "  ✅ tree $TREE_SHA"

# 创建 commit
echo "📝 创建 commit..."
COMMIT_JSON=$(curl -s -X POST "https://api.github.com/repos/$REPO/git/commits" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"message\":\"🎉 init: ETF 成分股查看器 CF Worker 版\",\"tree\":\"$TREE_SHA\"$PARENT}")
COMMIT_SHA=$(echo "$COMMIT_JSON" | python3 -c "import sys,json;print(json.load(sys.stdin)['sha'])")
echo "  ✅ commit $COMMIT_SHA"

# 更新 ref
echo "🚀 更新 ref..."
curl -s -X PATCH "https://api.github.com/repos/$REPO/git/refs/heads/$BRANCH" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"sha\":\"$COMMIT_SHA\",\"force\":true}"

echo ""
echo "🎉 推送完成！https://github.com/$REPO"
