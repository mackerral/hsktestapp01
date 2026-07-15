export function HskFilesView() {
  return (
    <div className="h-full w-full overflow-y-auto overscroll-contain">
      <div className="mx-auto flex min-h-full w-full max-w-xl flex-col justify-center px-4 py-6 sm:px-6">
        <div className="mb-4 text-center sm:mb-5">
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
            แจกไฟล์
          </h1>
          <p className="mt-0.5 text-xs text-muted-foreground sm:text-sm">
            ไฟล์สำหรับดาวน์โหลด
          </p>
        </div>

        <div className="grid grid-cols-1 gap-2.5">
          <div
            aria-disabled
            className="rounded-xl border border-dashed border-border/80 bg-muted/20 p-4 sm:p-5"
          >
            <div className="text-lg font-semibold tracking-tight text-muted-foreground sm:text-xl">
              HSK3.0 Supermap PDF
            </div>
            <div className="mt-1 text-xs text-muted-foreground sm:text-sm">
              Coming soon
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
