declare const __APP_VERSION__: string;
declare const __GIT_SHA__: string;

/** package.json version (release-please가 릴리스마다 올림) */
export const APP_VERSION = __APP_VERSION__;
/** 빌드한 커밋 (로컬 개발은 git 해시, 없으면 'dev') */
export const BUILD_SHA = __GIT_SHA__;
/** 화면 표시용: v0.2.0 (abc1234) */
export const BUILD_LABEL = `v${APP_VERSION} (${BUILD_SHA})`;
