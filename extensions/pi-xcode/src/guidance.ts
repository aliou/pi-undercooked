export const guidance = `
Use xcode_build with these actions only:
- build
- build_install
- build_run
- clean
- test

Aliases accepted:
- run -> build_run
- install -> build_install

If unsure, prefer:
1) xcode_project inspect/list_schemes
2) xcode_build build_run
`;
