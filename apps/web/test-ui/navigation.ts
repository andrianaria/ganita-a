export const useRouter = () => ({ refresh() {}, push(path: string) { window.location.assign(path); } });
