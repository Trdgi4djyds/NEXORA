package app.vitrine.shell;

import android.animation.Animator;
import android.animation.AnimatorListenerAdapter;
import android.animation.AnimatorSet;
import android.animation.Keyframe;
import android.animation.ObjectAnimator;
import android.animation.PropertyValuesHolder;
import android.animation.ValueAnimator;
import android.app.Activity;
import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.LinearGradient;
import android.graphics.Paint;
import android.graphics.PorterDuff;
import android.graphics.PorterDuffXfermode;
import android.graphics.RadialGradient;
import android.graphics.RenderEffect;
import android.graphics.Shader;
import android.os.Build;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.ViewAnimationUtils;
import android.view.ViewGroup;
import android.view.animation.AccelerateInterpolator;
import android.view.animation.BounceInterpolator;
import android.view.animation.DecelerateInterpolator;
import android.view.animation.LinearInterpolator;
import android.view.animation.OvershootInterpolator;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.TextView;

/**
 * Écran de démarrage animé : animation d'entrée du logo (pendant le chargement) et animation de sortie.
 * Entrées : none, pop, fadeUp, zoomOut, spin, flip, bounce, swing, pulse, heartbeat, shine, glow, typewriter, blurIn.
 * Sorties : fade, zoom, slideUp, shrink, reveal, blur, none.
 */
final class Splash {
    private Splash() { }

    /** Logo avec reflet lumineux balayant l'image (seulement sur les pixels du logo). */
    static final class Logo extends ImageView {
        float shine = -1f;
        final Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);

        Logo(Context c) {
            super(c);
            paint.setXfermode(new PorterDuffXfermode(PorterDuff.Mode.SRC_ATOP));
        }

        @Override
        protected void onDraw(Canvas canvas) {
            if (shine < 0f || shine > 1f) { super.onDraw(canvas); return; }
            int w = getWidth();
            int h = getHeight();
            if (w <= 0 || h <= 0) { super.onDraw(canvas); return; }
            int save = canvas.saveLayer(0, 0, w, h, null);
            super.onDraw(canvas);
            float x = -w + shine * w * 3f;
            paint.setShader(new LinearGradient(x, 0, x + w * 0.6f, h, new int[]{0x00FFFFFF, 0x99FFFFFF, 0x00FFFFFF}, new float[]{0f, 0.5f, 1f}, Shader.TileMode.CLAMP));
            canvas.drawRect(0, 0, w, h, paint);
            canvas.restoreToCount(save);
        }

        void setShine(float v) { shine = v; invalidate(); }
    }

    /** Halo coloré derrière le logo. */
    static final class Halo extends View {
        final Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
        int color;

        Halo(Context c, int color) {
            super(c);
            this.color = color;
        }

        @Override
        protected void onDraw(Canvas canvas) {
            float r = Math.min(getWidth(), getHeight()) / 2f;
            if (r <= 0.5f) return;
            paint.setShader(new RadialGradient(getWidth() / 2f, getHeight() / 2f, r, new int[]{(color & 0x00FFFFFF) | 0x88000000, (color & 0x00FFFFFF)}, null, Shader.TileMode.CLAMP));
            canvas.drawCircle(getWidth() / 2f, getHeight() / 2f, r, paint);
        }
    }

    static int dp(Context c, float v) {
        return Math.round(TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v, c.getResources().getDisplayMetrics()));
    }

    static boolean light(int c) {
        return (0.2126 * Color.red(c) + 0.7152 * Color.green(c) + 0.0722 * Color.blue(c)) / 255 > 0.6;
    }

    static View build(Activity a, Config cfg) {
        FrameLayout f = new FrameLayout(a);
        f.setBackgroundColor(cfg.splashBg);
        f.setClickable(true);
        // NEXORA #115 : fond composé dans le créateur d'écran de démarrage (drawable-nodpi/vt_splash_bg), rogné
        // pour remplir l'écran quel que soit son format ; la couleur de fond reste dessous pendant le chargement.
        int bgId = a.getResources().getIdentifier("vt_splash_bg", "drawable", a.getPackageName());
        if (bgId != 0) {
            ImageView bg = new ImageView(a);
            bg.setTag("bg");
            bg.setImageResource(bgId);
            bg.setScaleType(ImageView.ScaleType.CENTER_CROP);
            f.addView(bg, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        }
        LinearLayout col = new LinearLayout(a);
        col.setOrientation(LinearLayout.VERTICAL);
        col.setGravity(Gravity.CENTER_HORIZONTAL);
        int size = dp(a, cfg.splashLogoSize);
        FrameLayout holder = new FrameLayout(a);
        holder.setClipChildren(false);
        if ("glow".equals(cfg.splashIntro)) {
            Halo halo = new Halo(a, cfg.accent);
            halo.setTag("halo");
            FrameLayout.LayoutParams hl = new FrameLayout.LayoutParams(Math.round(size * 1.7f), Math.round(size * 1.7f));
            hl.gravity = Gravity.CENTER;
            holder.addView(halo, hl);
        }
        int id = a.getResources().getIdentifier("vt_splash_logo", "drawable", a.getPackageName());
        Logo logo = new Logo(a);
        logo.setTag("logo");
        if (id != 0) logo.setImageResource(id);
        logo.setScaleType(ImageView.ScaleType.FIT_CENTER);
        FrameLayout.LayoutParams ll = new FrameLayout.LayoutParams(size, size);
        ll.gravity = Gravity.CENTER;
        holder.addView(logo, ll);
        col.addView(holder, new LinearLayout.LayoutParams(Math.round(size * 1.7f), Math.round(size * 1.7f)));
        int textColor = cfg.splashTextColor != 0 ? cfg.splashTextColor : (light(cfg.splashBg) ? 0xFF1D1D1F : 0xFFFFFFFF);
        if (cfg.splashName && cfg.appName.length() > 0) {
            TextView name = new TextView(a);
            name.setTag("name");
            name.setText("typewriter".equals(cfg.splashIntro) ? "" : cfg.appName);
            name.setTextColor(textColor);
            name.setTextSize(TypedValue.COMPLEX_UNIT_SP, 24);
            name.setTypeface(android.graphics.Typeface.create("sans-serif-medium", android.graphics.Typeface.BOLD));
            name.setGravity(Gravity.CENTER);
            name.setLetterSpacing(-0.01f);
            LinearLayout.LayoutParams nl = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
            nl.topMargin = -Math.round(size * 0.22f);
            col.addView(name, nl);
        }
        if (cfg.splashTagline.length() > 0) {
            TextView tag = new TextView(a);
            tag.setTag("tagline");
            tag.setText(cfg.splashTagline);
            tag.setTextColor((textColor & 0x00FFFFFF) | 0xAA000000);
            tag.setTextSize(TypedValue.COMPLEX_UNIT_SP, 14);
            tag.setGravity(Gravity.CENTER);
            LinearLayout.LayoutParams tl = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
            tl.topMargin = dp(a, 6);
            col.addView(tag, tl);
        }
        FrameLayout.LayoutParams cl = new FrameLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        cl.gravity = Gravity.CENTER;
        f.addView(col, cl);
        return f;
    }

    static View find(View splash, String tag) {
        return splash.findViewWithTag(tag);
    }

    /** Animation d'entrée (et animations en boucle pendant le chargement). */
    static void intro(View splash, Config cfg) {
        final Logo logo = (Logo) find(splash, "logo");
        final View name = find(splash, "name");
        final View tagline = find(splash, "tagline");
        if (logo == null) return;
        Context c = splash.getContext();
        String a = cfg.splashIntro;
        for (View v : new View[]{name, tagline}) {
            if (v == null) continue;
            v.setAlpha(0f);
            v.setTranslationY(dp(c, 10));
            v.animate().alpha(1f).translationY(0).setStartDelay(260).setDuration(420).setInterpolator(new DecelerateInterpolator()).start();
        }
        switch (a) {
            case "pop":
                logo.setScaleX(0.3f); logo.setScaleY(0.3f); logo.setAlpha(0f);
                logo.animate().scaleX(1f).scaleY(1f).alpha(1f).setDuration(620).setInterpolator(new OvershootInterpolator(2.2f)).start();
                break;
            case "fadeUp":
                logo.setTranslationY(dp(c, 42)); logo.setAlpha(0f);
                logo.animate().translationY(0).alpha(1f).setDuration(560).setInterpolator(new DecelerateInterpolator(2f)).start();
                break;
            case "zoomOut":
                logo.setScaleX(1.8f); logo.setScaleY(1.8f); logo.setAlpha(0f);
                logo.animate().scaleX(1f).scaleY(1f).alpha(1f).setDuration(620).setInterpolator(new DecelerateInterpolator(2f)).start();
                break;
            case "spin":
                logo.setRotation(-200f); logo.setScaleX(0.4f); logo.setScaleY(0.4f); logo.setAlpha(0f);
                logo.animate().rotation(0f).scaleX(1f).scaleY(1f).alpha(1f).setDuration(760).setInterpolator(new DecelerateInterpolator(1.6f)).start();
                break;
            case "flip":
                logo.setCameraDistance(8000 * c.getResources().getDisplayMetrics().density);
                logo.setRotationY(-90f); logo.setAlpha(0f);
                logo.animate().rotationY(0f).alpha(1f).setDuration(640).setInterpolator(new OvershootInterpolator(1.3f)).start();
                break;
            case "bounce":
                logo.setTranslationY(-dp(c, 320)); logo.setAlpha(0f);
                logo.animate().translationY(0).alpha(1f).setDuration(980).setInterpolator(new BounceInterpolator()).start();
                break;
            case "swing": {
                logo.setPivotY(0f);
                ObjectAnimator s = ObjectAnimator.ofPropertyValuesHolder(logo, PropertyValuesHolder.ofKeyframe(View.ROTATION,
                        Keyframe.ofFloat(0f, 0f), Keyframe.ofFloat(0.2f, 15f), Keyframe.ofFloat(0.4f, -10f), Keyframe.ofFloat(0.6f, 5f), Keyframe.ofFloat(0.8f, -5f), Keyframe.ofFloat(1f, 0f)));
                s.setDuration(1000);
                logo.setAlpha(0f);
                logo.animate().alpha(1f).setDuration(240).start();
                s.start();
                break;
            }
            case "pulse": {
                ObjectAnimator p = ObjectAnimator.ofPropertyValuesHolder(logo, PropertyValuesHolder.ofFloat(View.SCALE_X, 1f, 1.08f), PropertyValuesHolder.ofFloat(View.SCALE_Y, 1f, 1.08f));
                p.setDuration(720);
                p.setRepeatCount(ValueAnimator.INFINITE);
                p.setRepeatMode(ValueAnimator.REVERSE);
                p.setInterpolator(new android.view.animation.AccelerateDecelerateInterpolator());
                logo.setTag(R_LOOP, p);
                p.start();
                break;
            }
            case "heartbeat": {
                ObjectAnimator h = ObjectAnimator.ofPropertyValuesHolder(logo,
                        PropertyValuesHolder.ofKeyframe(View.SCALE_X, Keyframe.ofFloat(0f, 1f), Keyframe.ofFloat(0.14f, 1.16f), Keyframe.ofFloat(0.28f, 1f), Keyframe.ofFloat(0.42f, 1.12f), Keyframe.ofFloat(0.7f, 1f), Keyframe.ofFloat(1f, 1f)),
                        PropertyValuesHolder.ofKeyframe(View.SCALE_Y, Keyframe.ofFloat(0f, 1f), Keyframe.ofFloat(0.14f, 1.16f), Keyframe.ofFloat(0.28f, 1f), Keyframe.ofFloat(0.42f, 1.12f), Keyframe.ofFloat(0.7f, 1f), Keyframe.ofFloat(1f, 1f)));
                h.setDuration(1200);
                h.setRepeatCount(ValueAnimator.INFINITE);
                logo.setTag(R_LOOP, h);
                h.start();
                break;
            }
            case "shine": {
                logo.setAlpha(0f);
                logo.animate().alpha(1f).setDuration(300).start();
                ValueAnimator s = ValueAnimator.ofFloat(0f, 1f);
                s.setDuration(1100);
                s.setStartDelay(250);
                s.setRepeatCount(ValueAnimator.INFINITE);
                s.setRepeatMode(ValueAnimator.RESTART);
                s.setInterpolator(new LinearInterpolator());
                s.addUpdateListener((va) -> logo.setShine((float) va.getAnimatedValue()));
                logo.setTag(R_LOOP, s);
                s.start();
                break;
            }
            case "glow": {
                View halo = find(splash, "halo");
                logo.setScaleX(0.7f); logo.setScaleY(0.7f); logo.setAlpha(0f);
                logo.animate().scaleX(1f).scaleY(1f).alpha(1f).setDuration(520).setInterpolator(new OvershootInterpolator(1.4f)).start();
                if (halo != null) {
                    ObjectAnimator g = ObjectAnimator.ofPropertyValuesHolder(halo, PropertyValuesHolder.ofFloat(View.ALPHA, 0.25f, 1f), PropertyValuesHolder.ofFloat(View.SCALE_X, 0.85f, 1.1f), PropertyValuesHolder.ofFloat(View.SCALE_Y, 0.85f, 1.1f));
                    g.setDuration(900);
                    g.setRepeatCount(ValueAnimator.INFINITE);
                    g.setRepeatMode(ValueAnimator.REVERSE);
                    logo.setTag(R_LOOP, g);
                    g.start();
                }
                break;
            }
            case "typewriter": {
                logo.setAlpha(0f); logo.setScaleX(0.9f); logo.setScaleY(0.9f);
                logo.animate().alpha(1f).scaleX(1f).scaleY(1f).setDuration(380).start();
                if (name instanceof TextView) {
                    final String full = cfg.appName;
                    ValueAnimator t = ValueAnimator.ofInt(0, full.length());
                    t.setDuration(Math.max(400, full.length() * 70L));
                    t.setStartDelay(380);
                    t.setInterpolator(new LinearInterpolator());
                    t.addUpdateListener((va) -> ((TextView) name).setText(full.substring(0, (int) va.getAnimatedValue())));
                    t.start();
                }
                break;
            }
            case "blurIn":
                if (Build.VERSION.SDK_INT >= 31) {
                    ValueAnimator b = ValueAnimator.ofFloat(40f, 0.01f);
                    b.setDuration(700);
                    b.addUpdateListener((va) -> {
                        float r = (float) va.getAnimatedValue();
                        logo.setRenderEffect(r < 0.5f ? null : RenderEffect.createBlurEffect(r, r, Shader.TileMode.DECAL));
                    });
                    logo.setAlpha(0f);
                    logo.animate().alpha(1f).setDuration(500).start();
                    b.start();
                } else {
                    logo.setAlpha(0f);
                    logo.animate().alpha(1f).setDuration(500).start();
                }
                break;
            default:
                break;
        }
    }

    static final int R_LOOP = 0x7f0f0001;

    /** Animation de sortie, puis end. */
    static void exit(View sp, Config cfg, Runnable end) {
        View logo = find(sp, "logo");
        if (logo != null) {
            Object loop = logo.getTag(R_LOOP);
            if (loop instanceof Animator) ((Animator) loop).cancel();
        }
        String a = cfg.splashAnim;
        Runnable done = () -> { if (sp.getParent() != null) end.run(); };
        switch (a) {
            case "none":
                end.run();
                return;
            case "zoom":
                if (logo != null) logo.animate().scaleX(1.7f).scaleY(1.7f).setDuration(340).start();
                sp.animate().alpha(0f).setDuration(340).withEndAction(done).start();
                return;
            case "slideUp":
                sp.animate().translationY(-sp.getHeight()).setDuration(420).setInterpolator(new AccelerateInterpolator(1.6f)).withEndAction(done).start();
                return;
            case "shrink":
                if (logo != null) {
                    logo.animate().scaleX(0f).scaleY(0f).setDuration(260).setInterpolator(new AccelerateInterpolator()).start();
                }
                sp.animate().alpha(0f).setStartDelay(180).setDuration(240).withEndAction(done).start();
                return;
            case "reveal":
                if (sp.isAttachedToWindow() && sp.getWidth() > 0) {
                    int cx = sp.getWidth() / 2;
                    int cy = sp.getHeight() / 2;
                    float r = (float) Math.hypot(cx, cy);
                    Animator an = ViewAnimationUtils.createCircularReveal(sp, cx, cy, r, 0f);
                    an.setDuration(460);
                    an.setInterpolator(new AccelerateInterpolator(1.2f));
                    an.addListener(new AnimatorListenerAdapter() {
                        @Override
                        public void onAnimationEnd(Animator animation) { sp.setVisibility(View.INVISIBLE); done.run(); }
                    });
                    an.start();
                    return;
                }
                break;
            case "blur":
                if (Build.VERSION.SDK_INT >= 31) {
                    ValueAnimator b = ValueAnimator.ofFloat(0.01f, 50f);
                    b.setDuration(380);
                    b.addUpdateListener((va) -> {
                        float r = (float) va.getAnimatedValue();
                        sp.setRenderEffect(RenderEffect.createBlurEffect(r, r, Shader.TileMode.CLAMP));
                    });
                    AnimatorSet set = new AnimatorSet();
                    set.playTogether(b, ObjectAnimator.ofFloat(sp, View.ALPHA, 1f, 0f));
                    set.setDuration(380);
                    set.addListener(new AnimatorListenerAdapter() {
                        @Override
                        public void onAnimationEnd(Animator animation) { done.run(); }
                    });
                    set.start();
                    return;
                }
                break;
            default:
                break;
        }
        sp.animate().alpha(0f).setDuration(260).withEndAction(done).start();
    }
}
