import { Link } from 'react-router-dom';

const NotFound = () => (
    <main className="flex min-h-screen items-center justify-center px-6">
        <div className="panel flex max-w-sm flex-col items-start gap-3 p-7">
            <p className="eyebrow">404</p>
            <h1 className="font-display text-3xl font-semibold tracking-[-0.02em]">No proof here.</h1>
            <p className="text-[14px] text-muted-foreground">This page doesn’t exist.</p>
            <Link to="/" className="text-[14px] font-medium text-primary underline-offset-4 hover:underline">
                Back to Proofline
            </Link>
        </div>
    </main>
);

export default NotFound;

