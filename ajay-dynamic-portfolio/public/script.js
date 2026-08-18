document.addEventListener('DOMContentLoaded', async () => {
    // Intersection Observer for Scroll Animations
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('active');
            }
        });
    }, { threshold: 0.1 });

    try {
        const res = await fetch('/api/content');
        const data = await res.json();
        
        // --- 1. HOME ---
        document.getElementById('home-label').textContent = data.home.label;
        document.getElementById('home-fname').textContent = data.home.firstName;
        document.getElementById('home-lname').textContent = data.home.lastName;
        document.getElementById('home-designation').textContent = data.home.designation;
        document.getElementById('home-supporting').textContent = data.home.supportingText;
        document.getElementById('home-tags').textContent = data.home.tags;
        
        const videoDiv = document.getElementById('home-video');
        if (data.videos && data.videos.length > 0) {
            // Show the latest video
            const latestVideo = data.videos[data.videos.length - 1];
            videoDiv.innerHTML = `
                <video controls style="width:100%; border-bottom:1px solid var(--glass-border);">
                    <source src="${latestVideo.url}" type="video/mp4">
                </video>
                <div style="padding:15px; background:var(--glass-bg);">
                    <h4 style="color:var(--accent-gold); margin-bottom:5px;">${latestVideo.title}</h4>
                    <p style="font-size:0.9rem; color:var(--text-secondary);">${latestVideo.description}</p>
                </div>
            `;
        }

        // --- 2. ABOUT ---
        document.getElementById('about-heading').innerHTML = data.about.heading;
        document.getElementById('about-desc').innerHTML = `
            <p>${data.about.description1}</p>
            <p>${data.about.description2}</p>
            <p>${data.about.description3}</p>
        `;
        const aboutTags = document.getElementById('about-tags');
        data.about.tags.forEach(tag => {
            aboutTags.innerHTML += `<span>${tag}</span>`;
        });

        // --- 3 & 4. EXPERIENCE ---
        document.getElementById('exp-label').textContent = data.experience.label;
        document.getElementById('exp-heading').innerHTML = data.experience.heading;
        document.getElementById('exp-start').textContent = data.experience.timeline.start;
        document.getElementById('exp-end').textContent = data.experience.timeline.end;
        document.getElementById('exp-pos').textContent = data.experience.timeline.position;
        document.getElementById('exp-comp').innerHTML = `${data.experience.timeline.company}<br>${data.experience.timeline.location}`;
        
        const expBullets = document.getElementById('exp-desc-bullets');
        data.experience.description.forEach(desc => {
            expBullets.innerHTML += `<li>${desc}</li>`;
        });

        const expCards = document.getElementById('exp-visual-cards');
        data.experience.cards.forEach(card => {
            let list = card.bullets.map(b => `<li>${b}</li>`).join('');
            expCards.innerHTML += `
                <div class="glass-card">
                    <span class="card-num">${card.id} / ${card.title}</span>
                    <ul>${list}</ul>
                </div>
            `;
        });

        // --- 5. SKILLS ---
        document.getElementById('skills-heading').innerHTML = data.skills.heading;
        const skillsCat = document.getElementById('skills-categories');
        data.skills.categories.forEach(cat => {
            let list = cat.skills.map(s => `<li>${s}</li>`).join('');
            skillsCat.innerHTML += `
                <div>
                    <h3 class="skill-category">${cat.name}</h3>
                    <ul style="list-style:none; color:var(--text-secondary); font-size:0.95rem; line-height:1.8;">
                        ${list}
                    </ul>
                </div>
            `;
        });

        // --- 6. EDUCATION ---
        document.getElementById('edu-heading').innerHTML = data.education.heading;
        const eduTimeline = document.getElementById('edu-timeline');
        data.education.items.forEach(edu => {
            eduTimeline.innerHTML += `
                <div class="edu-card">
                    <span class="small-label">${edu.period}</span>
                    <h3 class="serif" style="font-size:1.5rem; margin-bottom:5px;">${edu.institution}</h3>
                    <div style="color:var(--accent-gold); margin-bottom:15px; font-weight:500;">
                        ${edu.degree}<br>${edu.field}
                    </div>
                    <div style="color:var(--text-secondary); white-space:pre-line;">${edu.score}</div>
                </div>
            `;
        });

        // --- 7. CERTIFICATIONS ---
        document.getElementById('cert-heading').innerHTML = data.certifications.heading;
        const certGrid = document.getElementById('cert-grid');
        data.certifications.items.forEach(cert => {
            certGrid.innerHTML += `
                <div class="glass-card" style="padding:20px;">
                    <h3 style="font-size:1.1rem; margin-bottom:5px;">${cert.title}</h3>
                    <p style="color:var(--accent-gold); font-size:0.9rem; margin-bottom:10px;">${cert.subtitle}</p>
                    <p style="color:var(--text-secondary); font-size:0.8rem; text-transform:uppercase;">${cert.issuer}</p>
                </div>
            `;
        });

        // --- 8. LANGUAGES ---
        document.getElementById('lang-heading').innerHTML = data.languages.heading;
        const langGrid = document.getElementById('lang-grid');
        data.languages.items.forEach(lang => {
            langGrid.innerHTML += `
                <div class="glass-card" style="padding:20px; text-align:center;">
                    <h3 style="font-size:1.2rem; margin-bottom:5px; color:var(--accent-gold);">${lang.name}</h3>
                    <p style="color:var(--text-secondary); font-size:0.9rem;">${lang.level}</p>
                </div>
            `;
        });

        // --- 9. HIGHLIGHTS ---
        const highGrid = document.getElementById('highlights-grid');
        data.highlights.forEach(high => {
            highGrid.innerHTML += `
                <div class="highlight-card">
                    <span class="small-label">${high.id}</span>
                    <div class="highlight-metric serif">${high.metric}</div>
                    <div style="color:var(--text-secondary); font-size:0.9rem;">${high.label}</div>
                </div>
            `;
        });

        // --- 10. CAREER FOCUS ---
        document.getElementById('focus-label').textContent = data.careerFocus.label;
        document.getElementById('focus-heading').innerHTML = data.careerFocus.heading;
        document.getElementById('focus-desc').textContent = data.careerFocus.description;
        const focusCards = document.getElementById('focus-cards');
        data.careerFocus.cards.forEach(card => {
            focusCards.innerHTML += `
                <div class="glass-card">
                    <h3 style="color:var(--accent-gold); margin-bottom:15px; font-size:1.1rem;">${card.title}</h3>
                    <p style="color:var(--text-secondary); font-size:0.95rem;">${card.desc}</p>
                </div>
            `;
        });

        // Hide loading and observe reveals
        document.getElementById('loading').style.display = 'none';
        document.getElementById('portfolio-content').style.display = 'block';
        
        document.querySelectorAll('.reveal').forEach(el => observer.observe(el));

    } catch (err) {
        document.getElementById('loading').textContent = 'Error loading content. Make sure server is running.';
        console.error(err);
    }
});
