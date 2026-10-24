import { Router } from "express";
import { createPod } from '../kubernetes/pod.js';
import { deletePod } from '../kubernetes/pod.js';
import { createService } from '../kubernetes/service.js';
import { deleteService } from '../kubernetes/service.js';
import { k8sCoreV1Api } from '../kubernetes/config.js';
import { createSandboxKey } from '../config/redis.js';
import { v7 as uuid } from "uuid";
import { authMiddleware } from "../middlewares/auth.middleware.js";
import Project from "../models/project.model.js";

const router = Router();

async function waitForPodReady(sandboxId, timeoutMs = 90000) {
    const name = `sandbox-pod-${sandboxId}`;
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
        const response = await k8sCoreV1Api.readNamespacedPod({
            name,
            namespace: 'default'
        });
        const pod = response?.body || response;

        const statuses = pod.status?.containerStatuses || [];
        if (pod.status?.phase === 'Running' && statuses.length > 0 && statuses.every((container) => container.ready)) {
            return;
        }

        if (pod.status?.phase === 'Failed') {
            throw new Error(`Sandbox pod failed: ${pod.status?.reason || 'container startup failed'}`);
        }

        await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    throw new Error('Sandbox did not become ready within 90 seconds');
}

router.post('/project', authMiddleware, async (req, res) => {
    try {
        const { title } = req.body;

        const newProject = new Project({
            user: req.user.id,
            title: title || "Untitled Project"
        });

        await newProject.save();

        return res.status(201).json({
            message: 'Project created successfully',
            project: newProject
        });
    } catch (err) {
        console.error('Error creating project:', err);
        return res.status(500).json({ message: 'Internal server error' });
    }
});

router.post("/start", authMiddleware, async (req, res) => {
    let sandboxId;
    try {
        const projectId = req.body.projectId;

        if (!projectId) {
            return res.status(400).json({ message: 'Project ID is required' });
        }

        // Verify that the project belongs to the authenticated user
        const project = await Project.findOne({ _id: projectId, user: req.user.id });

        if (!project) {
            return res.status(404).json({ message: 'Project not found or access denied' });
        }

        sandboxId = uuid();

        // Create in order and wait for the containers to become ready before
        // returning a URL. Otherwise the UI immediately races an unstarted
        // pod and shows a broken preview/files/terminal pane.
        await createPod(sandboxId, projectId);
        await createService(sandboxId);
        await waitForPodReady(sandboxId);
        await createSandboxKey(sandboxId);

        const isProduction = process.env.NODE_ENV === 'production';
        const previewDomain = process.env.PREVIEW_DOMAIN || (isProduction ? 'preview.cryboy.in' : 'preview.localhost');
        const protocol = isProduction ? 'https' : 'http';

        return res.status(201).json({
            message: 'Sandbox environment created successfully',
            sandboxId,
            previewUrl: `${protocol}://${sandboxId}.${previewDomain}`
        });
    } catch (err) {
        console.error('Error starting sandbox:', err);
        if (sandboxId) {
            await Promise.allSettled([
                deletePod(sandboxId),
                deleteService(sandboxId)
            ]);
        }
        return res.status(500).json({ message: err.message || 'Failed to start sandbox' });
    }
});

router.get("/project", authMiddleware, async (req, res) => {
    try {
        const projects = await Project.find({ user: req.user.id });

        return res.status(200).json({
            message: 'Projects retrieved successfully',
            projects
        });
    } catch (err) {
        console.error('Error retrieving projects:', err);
        return res.status(500).json({ message: 'Internal server error' });
    }
});

export default router;
