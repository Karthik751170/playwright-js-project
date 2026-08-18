document.addEventListener('DOMContentLoaded', () => {
    const card = document.querySelector('.profile-card');
    
    // Add dynamic glow effect tracking mouse movement
    card.addEventListener('mousemove', e => {
        const rect = card.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        card.style.setProperty('--mouse-x', `${x}px`);
        card.style.setProperty('--mouse-y', `${y}px`);
    });

    // Add staggered entrance animation for child elements
    const elementsToAnimate = card.querySelectorAll('.profile-header, .about-section, .job, .skill-tag, .btn');
    
    elementsToAnimate.forEach((el, index) => {
        el.style.opacity = '0';
        el.style.transform = 'translateY(15px)';
        el.style.transition = `all 0.5s cubic-bezier(0.16, 1, 0.3, 1) ${0.3 + (index * 0.05)}s`;
    });

    // Trigger animations after a slight delay
    setTimeout(() => {
        elementsToAnimate.forEach(el => {
            el.style.opacity = '1';
            el.style.transform = 'translateY(0)';
        });
    }, 100);
});
