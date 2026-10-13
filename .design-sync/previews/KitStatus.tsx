import { KitStatus } from "fl-manager-ui";

export const NeedsYou = () => <KitStatus missing={2} warnings={1} accepted={false} aiVerified={false} />;

export const ReadyToReview = () => <KitStatus missing={0} warnings={3} accepted={false} aiVerified={false} />;

export const Reviewed = () => <KitStatus missing={0} warnings={0} accepted aiVerified />;
