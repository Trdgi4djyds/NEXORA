package app.vitrine.shell;

import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.RectF;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewConfiguration;
import android.view.animation.DecelerateInterpolator;
import android.widget.FrameLayout;

/** Tirer pour actualiser (sans bibliothèque AndroidX) : un disque avec un arc qui tourne. */
final class PullRefresh extends FrameLayout {
    interface Listener {
        void onRefresh();
    }

    private final View target;
    private final Indicator indicator;
    private final int slop;
    private final float density;
    private float startY;
    private float startX;
    private boolean pulling;
    private boolean refreshing;
    private float offset;
    boolean enabled = true;
    volatile boolean pageAtTop = true;
    Listener listener;

    PullRefresh(Context ctx, View target, int accent) {
        super(ctx);
        this.target = target;
        density = ctx.getResources().getDisplayMetrics().density;
        slop = ViewConfiguration.get(ctx).getScaledTouchSlop();
        addView(target, new LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT));
        indicator = new Indicator(ctx, accent);
        int size = (int) (40 * density);
        LayoutParams lp = new LayoutParams(size, size);
        lp.gravity = android.view.Gravity.CENTER_HORIZONTAL | android.view.Gravity.TOP;
        addView(indicator, lp);
        indicator.setTranslationY(-size);
        indicator.setElevation(6 * density);
    }

    boolean isRefreshing() {
        return refreshing;
    }

    void setRefreshing(boolean r) {
        refreshing = r;
        indicator.spinning = r;
        if (!r) indicator.animate().translationY(-indicator.getHeight() - 4 * density).alpha(0f).setDuration(220).start();
        indicator.invalidate();
    }

    @Override
    public boolean onInterceptTouchEvent(MotionEvent ev) {
        if (!enabled || refreshing) return false;
        switch (ev.getActionMasked()) {
            case MotionEvent.ACTION_DOWN:
                startY = ev.getY();
                startX = ev.getX();
                pulling = false;
                break;
            case MotionEvent.ACTION_MOVE:
                float dy = ev.getY() - startY;
                float dx = Math.abs(ev.getX() - startX);
                if (!pulling && dy > slop * 2 && dy > dx * 1.5f && !target.canScrollVertically(-1) && pageAtTop) {
                    pulling = true;
                    startY = ev.getY();
                    indicator.setAlpha(1f);
                    return true;
                }
                break;
            default:
                break;
        }
        return false;
    }

    @Override
    public boolean onTouchEvent(MotionEvent ev) {
        if (!pulling) return false;
        float max = 110 * density;
        float threshold = 72 * density;
        switch (ev.getActionMasked()) {
            case MotionEvent.ACTION_MOVE:
                float dy = Math.max(0, ev.getY() - startY);
                offset = max * (1 - (float) Math.exp(-dy / (max * 1.4f)));
                indicator.setTranslationY(offset - indicator.getHeight());
                indicator.progress = Math.min(1f, offset / threshold);
                indicator.invalidate();
                return true;
            case MotionEvent.ACTION_UP:
            case MotionEvent.ACTION_CANCEL:
                pulling = false;
                if (offset >= threshold * 0.98f && listener != null) {
                    refreshing = true;
                    indicator.spinning = true;
                    indicator.animate().translationY(threshold * 0.75f - indicator.getHeight() / 2f).setDuration(160).setInterpolator(new DecelerateInterpolator()).start();
                    indicator.invalidate();
                    listener.onRefresh();
                } else {
                    indicator.animate().translationY(-indicator.getHeight() - 4 * density).setDuration(200).start();
                }
                offset = 0;
                return true;
            default:
                return true;
        }
    }

    private static final class Indicator extends View {
        final Paint bg = new Paint(Paint.ANTI_ALIAS_FLAG);
        final Paint arc = new Paint(Paint.ANTI_ALIAS_FLAG);
        final RectF r = new RectF();
        float progress;
        boolean spinning;
        float angle;

        Indicator(Context c, int accent) {
            super(c);
            bg.setColor(Color.WHITE);
            arc.setColor(accent);
            arc.setStyle(Paint.Style.STROKE);
            arc.setStrokeCap(Paint.Cap.ROUND);
            arc.setStrokeWidth(3 * c.getResources().getDisplayMetrics().density);
        }

        @Override
        protected void onDraw(Canvas canvas) {
            float w = getWidth();
            float h = getHeight();
            canvas.drawCircle(w / 2, h / 2, Math.min(w, h) / 2, bg);
            float pad = w * 0.28f;
            r.set(pad, pad, w - pad, h - pad);
            if (spinning) {
                angle = (angle + 9) % 360;
                canvas.drawArc(r, angle, 270, false, arc);
                postInvalidateOnAnimation();
            } else {
                canvas.drawArc(r, -90, 300 * progress, false, arc);
            }
        }
    }
}
