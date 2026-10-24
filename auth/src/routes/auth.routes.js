import { Router } from "express";
import User from "../models/user.model.js";
import passport from "passport";
import { sendAuthNotification } from "../config/mq.js";
import jwt from "jsonwebtoken";

const router = Router();


router.get('/google', passport.authenticate('google', {
    session: false,
    scope: [ 'profile', 'email' ]
}));

router.get('/google/callback', passport.authenticate('google', {
    session: false,
    failureRedirect: '/'
}), async (req, res) => {
    try {
        const { id, displayName, emails, photos } = req.user;
        let user = await User.findOne({ googleId: id });



        if (!user) {
            user = new User({
                googleId: id,
                email: emails[ 0 ].value,
                name: displayName,
                avatar: photos[ 0 ].value
            });
            await user.save();
        }

        await sendAuthNotification({
            userId: user._id,
            action: 'google_login',
            timestamp: new Date(),
            email: emails[ 0 ].value
        });

        // Generate JWT token
        const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '7d' });

        const isProduction = process.env.NODE_ENV === 'production';
        const frontendUrl = process.env.FRONTEND_URL || (isProduction ? 'https://www.cryboy.in' : 'http://localhost:5173');
        const cookieDomain = process.env.COOKIE_DOMAIN || (isProduction ? '.cryboy.in' : undefined);

        // Set token in cookie
        const cookieOptions = {
            httpOnly: true,           // JS can't read it — XSS protection
            secure: isProduction,     // only sent over HTTPS in production
            sameSite: isProduction ? 'none' : 'lax',
            maxAge: 7 * 24 * 60 * 60 * 1000  // 7 days
        };

        if (cookieDomain) {
            cookieOptions.domain = cookieDomain;
        }

        res.cookie('token', token, cookieOptions);
        res.redirect(frontendUrl); // Redirect to frontend after successful login
    } catch (err) {
        console.error('Error during Google authentication:', err);
        res.redirect('/'); // Redirect to your frontend on error
    }
});

// Get current authenticated user profile
router.get('/me', async (req, res) => {
    try {
        const token = req.cookies?.token || req.headers[ 'authorization' ]?.split(' ')[ 1 ];
        if (!token) {
            return res.status(401).json({ authenticated: false, message: 'Not authenticated' });
        }
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findById(decoded.id).select('-__v');
        if (!user) {
            return res.status(401).json({ authenticated: false, message: 'User not found' });
        }
        return res.status(200).json({
            authenticated: true,
            user: {
                id: user._id,
                email: user.email,
                name: user.name,
                avatar: user.avatar
            }
        });
    } catch (err) {
        return res.status(401).json({ authenticated: false, message: 'Invalid or expired token' });
    }
});

// Logout endpoint — clears authentication token cookie
const handleLogout = (req, res) => {
    const isProduction = process.env.NODE_ENV === 'production';
    const cookieDomain = process.env.COOKIE_DOMAIN || (isProduction ? '.cryboy.in' : undefined);

    const cookieOptions = {
        httpOnly: true,
        secure: isProduction,
        sameSite: isProduction ? 'none' : 'lax'
    };

    if (cookieDomain) {
        cookieOptions.domain = cookieDomain;
    }

    res.cookie('token', '', { ...cookieOptions, expires: new Date(0), maxAge: 0 });
    res.clearCookie('token', cookieOptions);

    if (cookieDomain) {
        res.cookie('token', '', { ...cookieOptions, domain: undefined, expires: new Date(0), maxAge: 0 });
        res.clearCookie('token');
    }

    if (req.xhr || req.headers.accept?.includes('application/json') || req.method === 'POST') {
        return res.status(200).json({ success: true, message: 'Logged out successfully' });
    }

    const frontendUrl = process.env.FRONTEND_URL || '/';
    return res.redirect(frontendUrl);
};

router.get('/logout', handleLogout);
router.post('/logout', handleLogout);

export default router;
