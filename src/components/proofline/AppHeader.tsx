const AppHeader = () => (
    <header className="container pt-7 pb-5 sm:pt-9 sm:pb-6">
        <div className="flex flex-col gap-3 border-b border-border pb-5 sm:flex-row sm:items-end sm:justify-between">
            <div className="flex flex-col gap-1">
                <h1 className="font-display text-[2.1rem] font-semibold leading-none tracking-[-0.025em] sm:text-[2.5rem]">
                    Proof<span className="italic font-medium text-primary">line</span>
                </h1>
                <p className="font-display text-lg italic leading-snug text-muted-foreground">Find the facts. Keep the proof.</p>
            </div>
            <p className="eyebrow">Invoices · Agreements · Meeting notes</p>
        </div>
    </header>
);

export default AppHeader;

